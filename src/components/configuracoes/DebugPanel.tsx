import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/format';
import { Bug, Search, BarChart3, Loader2, Trash2, Check, X, AlertTriangle, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { generateHash } from '@/lib/csv-parser';

const MONTH_LABELS: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

interface DupGroup {
  key: string;
  descricao: string;
  valor: number;
  pessoa: string;
  month: string;
  parcela: string;
  items: any[];
  keepId: string;
  removeIds: string[];
}

function ResetContaSection({ contas, userId, queryClient }: { contas: any[]; userId?: string; queryClient: any }) {
  const [selectedContaId, setSelectedContaId] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const selectedConta = contas.find(c => c.id === selectedContaId);
  const contaNome = selectedConta?.nome || '';
  const confirmed = confirmText.trim().toLowerCase() === contaNome.toLowerCase() && contaNome !== '';

  const handleReset = async () => {
    if (!userId || !selectedContaId || !confirmed) return;
    setDeleting(true);
    try {
      let deleted = 0;
      // Delete in batches
      while (true) {
        const { data } = await supabase
          .from('transacoes')
          .select('id')
          .eq('user_id', userId)
          .eq('conta_id', selectedContaId)
          .limit(500);
        if (!data || data.length === 0) break;
        deleted += data.length;
        await supabase.from('transacoes').delete().in('id', data.map(t => t.id));
      }
      toast.success(`${deleted} transações da conta "${contaNome}" removidas`);
      queryClient.invalidateQueries();
      setSelectedContaId('');
      setConfirmText('');
    } catch (err) {
      toast.error('Erro ao resetar conta');
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Resetar Conta Específica
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Deleta TODAS as transações de uma conta específica. O saldo inicial e a conta são preservados.
        </p>
        <Select value={selectedContaId} onValueChange={(v) => { setSelectedContaId(v); setConfirmText(''); }}>
          <SelectTrigger className="w-[220px] h-8 text-xs">
            <SelectValue placeholder="Selecione a conta" />
          </SelectTrigger>
          <SelectContent>
            {contas.map(c => (
              <SelectItem key={c.id} value={c.id} className="text-xs">{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedContaId && (
          <div className="space-y-2">
            <p className="text-xs">
              Digite <strong className="text-destructive">{contaNome}</strong> para confirmar:
            </p>
            <Input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={contaNome}
              className="h-8 text-xs w-[220px]"
            />
            <Button
              variant="destructive"
              size="sm"
              disabled={!confirmed || deleting}
              onClick={handleReset}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Deletar todas transações de "{contaNome}"
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectInstallmentsSection({ userId, queryClient }: { userId?: string; queryClient: any }) {
  const [loading, setLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const handleProject = async () => {
    if (!userId) return;
    setLoading(true);
    setResultMsg(null);

    try {
      // Fetch all installment transactions that are NOT the last installment
      let allInstallments: any[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('transacoes')
          .select('*')
          .eq('user_id', userId)
          .not('parcela_atual', 'is', null)
          .not('parcela_total', 'is', null)
          .order('data', { ascending: true })
          .range(from, from + batchSize - 1);
        if (!data || data.length === 0) break;
        allInstallments = allInstallments.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }

      // For each unique group, find the latest parcela and project forward
      // Group by: conta_id + descricao prefix (15 chars) + valor (±0.10) + pessoa + parcela_total
      const groups = new Map<string, any[]>();
      for (const t of allInstallments) {
        const prefix = t.descricao.replace(/\(auto-projetada\)/g, '').trim().substring(0, 15).toLowerCase();
        const key = `${t.conta_id}|${prefix}|${Math.round(Number(t.valor) * 100)}|${t.pessoa}|${t.parcela_total}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(t);
      }

      const toInsert: any[] = [];

      for (const [, items] of groups) {
        // Find the highest parcela_atual in this group
        items.sort((a: any, b: any) => (b.parcela_atual || 0) - (a.parcela_atual || 0));
        const latest = items[0];
        const maxParcela = latest.parcela_atual;
        const totalParcelas = latest.parcela_total;

        if (maxParcela >= totalParcelas) continue; // Already complete

        // Existing parcela numbers in this group
        const existingParcelas = new Set(items.map((t: any) => t.parcela_atual));

        // Base description without "(auto-projetada)"
        const baseDesc = latest.descricao.replace(/\s*\(auto-projetada\)/, '').trim();

        for (let p = maxParcela + 1; p <= totalParcelas; p++) {
          if (existingParcelas.has(p)) continue;

          // Calculate future date: offset months from latest
          const offset = p - latest.parcela_atual;
          const futureDate = new Date(latest.data + 'T00:00:00');
          futureDate.setMonth(futureDate.getMonth() + offset);
          const isoDate = futureDate.toISOString().split('T')[0];

          // Project data_original forward too
          let projectedOriginal: string | null = null;
          if (latest.data_original) {
            const origDate = new Date(latest.data_original + 'T00:00:00');
            origDate.setMonth(origDate.getMonth() + offset);
            projectedOriginal = origDate.toISOString().split('T')[0];
          }

          // Project mes_competencia forward
          let projectedCompetencia: string | null = null;
          if (latest.mes_competencia) {
            const [cy, cm] = latest.mes_competencia.split('-').map(Number);
            const compDate = new Date(cy, cm - 1 + offset, 1);
            projectedCompetencia = `${compDate.getFullYear()}-${String(compDate.getMonth() + 1).padStart(2, '0')}`;
          }

          const hash = generateHash(isoDate, baseDesc, Number(latest.valor), latest.pessoa) + `_p${p}`;

          toInsert.push({
            user_id: userId,
            conta_id: latest.conta_id,
            data: isoDate,
            data_original: projectedOriginal,
            mes_competencia: projectedCompetencia,
            descricao: `${baseDesc} (auto-projetada)`,
            valor: Number(latest.valor),
            categoria: latest.categoria,
            tipo: latest.tipo,
            essencial: latest.essencial,
            parcela_atual: p,
            parcela_total: totalParcelas,
            grupo_parcela: latest.grupo_parcela,
            hash_transacao: hash,
            pessoa: latest.pessoa,
          });
        }
      }

      if (toInsert.length === 0) {
        setResultMsg('Nenhuma parcela futura para projetar. Tudo já está completo.');
        toast.info('Nenhuma parcela futura para projetar');
      } else {
        // Upsert to avoid duplicates
        let created = 0;
        for (let i = 0; i < toInsert.length; i += 50) {
          const batch = toInsert.slice(i, i + 50);
          const { data, error } = await supabase
            .from('transacoes')
            .upsert(batch, { onConflict: 'user_id,hash_transacao' })
            .select('id');
          if (error) {
            console.error('Upsert error:', error);
          } else {
            created += data?.length || 0;
          }
        }
        setResultMsg(`${created} parcelas futuras projetadas com sucesso!`);
        toast.success(`${created} parcelas futuras projetadas`);
        queryClient.invalidateQueries();
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao projetar parcelas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarPlus className="h-4 w-4" />
          Projeção de Parcelas Futuras
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Analisa todas as transações parceladas e cria projeções automáticas para as parcelas restantes.
          Execute após importar todos os CSVs do período.
        </p>
        <Button onClick={handleProject} disabled={loading} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CalendarPlus className="h-4 w-4 mr-1" />}
          Calcular Parcelas Futuras
        </Button>
        {resultMsg && (
          <div className="p-3 rounded-md bg-muted border text-xs">
            <p className="font-medium text-foreground">{resultMsg}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DebugPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [diagData, setDiagData] = useState<any[] | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [dedupLoading, setDedupLoading] = useState(false);
  const [dedupGroups, setDedupGroups] = useState<DupGroup[] | null>(null);
  const [dedupModalOpen, setDedupModalOpen] = useState(false);
  const [dedupDeleting, setDedupDeleting] = useState(false);
  const [dedupSummary, setDedupSummary] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedConta, setSelectedConta] = useState('');

  const { data: contas } = useQuery({
    queryKey: ['debug-contas', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contas').select('*').eq('user_id', user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: stats } = useQuery({
    queryKey: ['debug-stats', user?.id],
    queryFn: async () => {
      const { data: all } = await supabase
        .from('transacoes')
        .select('id, conta_id, data, tipo, valor, parcela_atual, parcela_total')
        .eq('user_id', user!.id);

      const txs = all || [];
      const total = txs.length;

      const byConta: Record<string, number> = {};
      txs.forEach(t => {
        byConta[t.conta_id] = (byConta[t.conta_id] || 0) + 1;
      });

      const byMonth: Record<string, number> = {};
      txs.forEach(t => {
        const key = t.data.substring(0, 7);
        byMonth[key] = (byMonth[key] || 0) + 1;
      });

      const futuras = txs.filter(t => t.parcela_atual && t.parcela_total && t.parcela_atual < t.parcela_total).length;

      return { total, byConta, byMonth, futuras };
    },
    enabled: !!user,
  });

  // Available months from stats
  const availableMonths = useMemo(() => {
    if (!stats?.byMonth) return [];
    return Object.keys(stats.byMonth).sort();
  }, [stats]);

  // Set defaults when data loads
  useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  useEffect(() => {
    if (contas && contas.length > 0 && !selectedConta) {
      setSelectedConta(contas[0].id);
    }
  }, [contas, selectedConta]);

  const getContaNome = (id: string) => contas?.find(c => c.id === id)?.nome || id.slice(0, 8);

  const formatMonthLabel = (ym: string) => {
    const [y, m] = ym.split('-');
    return `${MONTH_LABELS[m] || m} ${y}`;
  };

  const selectedContaNome = contas?.find(c => c.id === selectedConta)?.nome || '';

  // Auto-run diagnostic when month/conta change
  useEffect(() => {
    if (!user || !selectedMonth || !selectedConta) return;
    const runDiag = async () => {
      setDiagLoading(true);
      const [year, month] = selectedMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDay = new Date(Number(year), Number(month), 0).getDate();
      const endDate = `${year}-${month}-${String(endDay).padStart(2, '0')}`;
      const { data } = await supabase
        .from('transacoes')
        .select('*')
        .eq('user_id', user.id)
        .eq('conta_id', selectedConta)
        .gte('data', startDate)
        .lte('data', endDate)
        .order('data', { ascending: true });
      setDiagData(data || []);
      setDiagLoading(false);
    };
    runDiag();
  }, [user, selectedMonth, selectedConta]);

  const handleSearch = async () => {
    if (!user || !searchTerm.trim()) return;
    setSearchLoading(true);
    const numericTerm = Number(searchTerm.replace(',', '.'));
    let query = supabase
      .from('transacoes')
      .select('*')
      .eq('user_id', user.id)
      .order('data', { ascending: false })
      .limit(100);
    if (!Number.isNaN(numericTerm) && searchTerm.trim() !== '') {
      query = query.or(`descricao.ilike.%${searchTerm}%,valor.eq.${numericTerm}`);
    } else {
      query = query.ilike('descricao', `%${searchTerm}%`);
    }
    const { data } = await query;
    setSearchResults(data || []);
    setSearchLoading(false);
  };

  // Normalize: lowercase, trim, collapse spaces
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

  // First 15 chars prefix for matching
  const prefix15 = (s: string) => normalize(s).substring(0, 15);

  const analyzeDuplicates = async () => {
    if (!user) return;
    setDedupLoading(true);
    setDedupSummary(null);
    try {
      let allTxs: any[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('transacoes')
          .select('id, descricao, valor, pessoa, data, data_original, conta_id, parcela_atual, parcela_total, created_at, tipo')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .range(from, from + batchSize - 1);
        if (!data || data.length === 0) break;
        allTxs = allTxs.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }

      // Separate installment vs non-installment transactions
      const isInstallment = (t: any) => t.parcela_atual != null && t.parcela_total != null;
      const isAutoProjected = (t: any) => t.descricao?.includes('(auto-projetada)');

      // Group key: for installments use data_original (competencia) if available; for non-installments include month
      const coarseGroups: Record<string, any[]> = {};
      allTxs.forEach(t => {
        const pref = prefix15(t.descricao);
        const pessoa = normalize(t.pessoa);
        let key: string;
        if (isInstallment(t)) {
          // Installments: group by conta + pessoa + parcela + prefix + data_original (competencia)
          // data_original allows exact matching; if missing, use 'any' to still group across months
          const comp = t.data_original || 'any';
          key = `INST|${t.conta_id}|${pessoa}|${t.parcela_atual}/${t.parcela_total}|${pref}|${comp}`;
        } else {
          // Non-installments: group by conta + month + pessoa + prefix
          const month = t.data.substring(0, 7);
          key = `NORM|${t.conta_id}|${month}|${pessoa}|${pref}`;
        }
        if (!coarseGroups[key]) coarseGroups[key] = [];
        coarseGroups[key].push(t);
      });

      // Within each group, cluster by value tolerance ≤ R$ 0.10
      let idx_counter = 0;
      const dupGroups: DupGroup[] = [];
      Object.entries(coarseGroups).forEach(([, items]) => {
        if (items.length < 2) return;
        const clusters: any[][] = [];
        const assigned = new Set<number>();

        for (let i = 0; i < items.length; i++) {
          if (assigned.has(i)) continue;
          const cluster = [items[i]];
          assigned.add(i);
          for (let j = i + 1; j < items.length; j++) {
            if (assigned.has(j)) continue;
            const valDiff = Math.abs(Number(items[i].valor) - Number(items[j].valor));
            if (valDiff <= 0.10) {
              cluster.push(items[j]);
              assigned.add(j);
            }
          }
          if (cluster.length > 1) clusters.push(cluster);
        }

        clusters.forEach(cluster => {
          const hasInstallments = cluster.some(isInstallment);
          let keepItem: any;

          if (hasInstallments) {
            const realOnes = cluster.filter((t: any) => !isAutoProjected(t));
            if (realOnes.length > 0) {
              realOnes.sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
              keepItem = realOnes[0];
            } else {
              cluster.sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
              keepItem = cluster[0];
            }
          } else {
            cluster.sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
            keepItem = cluster[0];
          }

          const removeIds = cluster.filter((t: any) => t.id !== keepItem.id).map((t: any) => t.id);

          dupGroups.push({
            key: `${prefix15(keepItem.descricao)}|${Math.round(Number(keepItem.valor))}|${keepItem.conta_id}|${idx_counter++}`,
            descricao: keepItem.descricao,
            valor: Number(keepItem.valor),
            pessoa: keepItem.pessoa,
            month: keepItem.data.substring(0, 7),
            parcela: keepItem.parcela_atual != null ? `${keepItem.parcela_atual}/${keepItem.parcela_total}` : '-',
            items: cluster,
            keepId: keepItem.id,
            removeIds,
          });
        });
      });

      if (dupGroups.length === 0) {
        toast.info('Nenhuma duplicata encontrada');
      } else {
        dupGroups.sort((a, b) => b.removeIds.length - a.removeIds.length);
        setDedupGroups(dupGroups);
        setDedupModalOpen(true);
      }
    } catch (err) {
      toast.error('Erro ao analisar duplicatas');
      console.error(err);
    } finally {
      setDedupLoading(false);
    }
  };

  const handleChangeKeep = (groupIdx: number, newKeepId: string) => {
    if (!dedupGroups) return;
    const updated = [...dedupGroups];
    const group = { ...updated[groupIdx] };
    group.keepId = newKeepId;
    group.removeIds = group.items.filter((t: any) => t.id !== newKeepId).map((t: any) => t.id);
    updated[groupIdx] = group;
    setDedupGroups(updated);
  };

  const confirmDeleteDuplicates = async () => {
    if (!dedupGroups) return;
    setDedupDeleting(true);
    try {
      const removedByKey: Record<string, number> = {};
      dedupGroups.forEach(g => {
        g.removeIds.forEach(rid => {
          const item = g.items.find((t: any) => t.id === rid);
          if (item) {
            const k = `${item.conta_id}|${item.data.substring(0, 7)}`;
            removedByKey[k] = (removedByKey[k] || 0) + Number(item.valor);
          }
        });
      });

      const allIds = dedupGroups.flatMap(g => g.removeIds);
      for (let i = 0; i < allIds.length; i += 100) {
        const batch = allIds.slice(i, i + 100);
        await supabase.from('transacoes').delete().in('id', batch);
      }

      const summaryParts: string[] = [`Removidas ${allIds.length} duplicatas.`];
      Object.entries(removedByKey).forEach(([key, removedVal]) => {
        const [contaId, month] = key.split('|');
        const contaNome = getContaNome(contaId);
        summaryParts.push(`${contaNome} ${formatMonthLabel(month)}: -${formatCurrency(removedVal)}`);
      });

      setDedupSummary(summaryParts.join(' '));
      toast.success(`${allIds.length} duplicata(s) removida(s)`);
      queryClient.invalidateQueries();
      setDedupModalOpen(false);
      setDedupGroups(null);
    } catch (err) {
      toast.error('Erro ao remover duplicatas');
      console.error(err);
    } finally {
      setDedupDeleting(false);
    }
  };

  const totalToRemove = dedupGroups?.reduce((s, g) => s + g.removeIds.length, 0) || 0;
  const totalToKeep = dedupGroups?.length || 0;

  const diagDespesas = diagData?.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0) || 0;
  const diagReceitas = diagData?.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0) || 0;

  return (
    <div className="space-y-4">
      {/* Section 1: Diagnóstico Dinâmico */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Diagnóstico: {selectedMonth ? formatMonthLabel(selectedMonth) : '...'} — {selectedContaNome || '...'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map(ym => (
                  <SelectItem key={ym} value={ym} className="text-xs">{formatMonthLabel(ym)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedConta} onValueChange={setSelectedConta}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Conta" />
              </SelectTrigger>
              <SelectContent>
                {contas?.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {diagLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground self-center" />}
          </div>

          {diagData && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-muted">
                  <span className="text-muted-foreground">Total:</span>{' '}
                  <strong>{diagData.length}</strong>
                </div>
                <div className="p-2 rounded bg-muted">
                  <span className="text-muted-foreground">Despesas:</span>{' '}
                  <strong className="text-destructive">{formatCurrency(diagDespesas)}</strong>
                </div>
                <div className="p-2 rounded bg-muted">
                  <span className="text-muted-foreground">Receitas:</span>{' '}
                  <strong className="text-green-500">{formatCurrency(diagReceitas)}</strong>
                </div>
                <div className="p-2 rounded bg-muted">
                  <span className="text-muted-foreground">Líquido:</span>{' '}
                  <strong>{formatCurrency(diagReceitas - diagDespesas)}</strong>
                </div>
              </div>

              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">ID</TableHead>
                      <TableHead className="text-[10px]">Data</TableHead>
                      <TableHead className="text-[10px]">Descrição</TableHead>
                      <TableHead className="text-[10px] text-right">Valor</TableHead>
                      <TableHead className="text-[10px]">Tipo</TableHead>
                      <TableHead className="text-[10px]">Hash</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diagData.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="text-[10px] font-mono">{t.id.slice(0, 8)}</TableCell>
                        <TableCell className="text-[10px]">{t.data}</TableCell>
                        <TableCell className="text-[10px] max-w-[180px] truncate" title={t.descricao}>{t.descricao}</TableCell>
                        <TableCell className={`text-[10px] text-right font-medium ${t.tipo === 'receita' ? 'text-green-500' : 'text-destructive'}`}>
                          {t.tipo === 'receita' ? '+' : '-'}{formatCurrency(Number(t.valor))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.tipo === 'receita' ? 'secondary' : 'outline'} className="text-[9px]">
                            {t.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono text-muted-foreground" title={t.hash_transacao}>
                          {t.hash_transacao.slice(0, 12)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Busca Específica
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder='Ex: "Devolucao" ou "718"'
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={searchLoading} size="sm">
              {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
            </Button>
          </div>

          {searchResults !== null && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {searchResults.length} resultado(s) encontrado(s)
              </p>
              {searchResults.length > 0 && (
                <ScrollArea className="max-h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Data</TableHead>
                        <TableHead className="text-[10px]">Descrição</TableHead>
                        <TableHead className="text-[10px] text-right">Valor</TableHead>
                        <TableHead className="text-[10px]">Tipo</TableHead>
                        <TableHead className="text-[10px]">Conta</TableHead>
                        <TableHead className="text-[10px]">Hash</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchResults.map(t => (
                        <TableRow key={t.id}>
                          <TableCell className="text-[10px]">{t.data}</TableCell>
                          <TableCell className="text-[10px] max-w-[160px] truncate" title={t.descricao}>{t.descricao}</TableCell>
                          <TableCell className={`text-[10px] text-right ${t.tipo === 'receita' ? 'text-green-500' : 'text-destructive'}`}>
                            {formatCurrency(Number(t.valor))}
                          </TableCell>
                          <TableCell className="text-[10px]">{t.tipo}</TableCell>
                          <TableCell className="text-[10px]">{getContaNome(t.conta_id)}</TableCell>
                          <TableCell className="text-[10px] font-mono text-muted-foreground">{t.hash_transacao.slice(0, 12)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Dedup with preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            Limpar Duplicatas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Busca transações com descrição similar (15 chars), valor ±R$ 0,10, mesma pessoa, data_competencia exata e mesma parcela. Mostra prévia antes de remover.
          </p>
          <Button onClick={analyzeDuplicates} disabled={dedupLoading} size="sm" variant="destructive">
            {dedupLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
            Analisar Duplicatas
          </Button>
          {dedupSummary && (
            <div className="p-3 rounded-md bg-muted border text-xs">
              <p className="font-medium text-foreground">{dedupSummary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dedup Preview Modal */}
      <Dialog open={dedupModalOpen} onOpenChange={setDedupModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Duplicatas Encontradas</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground px-6">
            {totalToRemove} transações serão removidas, {totalToKeep} grupo(s). Clique no rádio para escolher qual manter.
          </p>
          <div className="flex-1 overflow-y-auto px-6 py-2" style={{ maxHeight: '70vh' }}>
            <div className="space-y-4">
              {dedupGroups?.map((group, idx) => (
                <div key={group.key} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <p className="text-sm font-medium">
                      Grupo {idx + 1}: {group.descricao.substring(0, 40)}
                    </p>
                    <div className="flex gap-1 flex-wrap">
                      {group.parcela !== '-' && (
                        <Badge variant="secondary" className="text-[10px]">{group.parcela}</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {formatCurrency(group.valor)} · {group.pessoa}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item: any) => {
                      const isKeep = item.id === group.keepId;
                      const isAuto = item.descricao?.includes('(auto-projetada)');
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleChangeKeep(idx, item.id)}
                          className={`flex items-center gap-2 text-xs p-2 rounded w-full text-left transition-colors ${
                            isKeep ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-destructive/10 hover:bg-destructive/15'
                          }`}
                        >
                          <span className={`h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                            isKeep ? 'border-primary' : 'border-muted-foreground'
                          }`}>
                            {isKeep && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                          </span>
                          <span className="font-mono text-muted-foreground">{item.id.slice(0, 8)}</span>
                          <span>{item.data}</span>
                          {item.data_original && (
                            <span className="text-muted-foreground">(comp: {item.data_original})</span>
                          )}
                          <span className="text-muted-foreground">{formatCurrency(Number(item.valor))}</span>
                          {isAuto && <Badge variant="secondary" className="text-[9px]">auto</Badge>}
                          <span className={`ml-auto font-medium ${isKeep ? 'text-primary' : 'text-destructive'}`}>
                            {isKeep ? 'mantém' : 'remove'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="px-6 pb-6 pt-2 border-t">
            <Button variant="outline" onClick={() => setDedupModalOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDeleteDuplicates} disabled={dedupDeleting}>
              {dedupDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Remover {totalToRemove} duplicata(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section 4: Resetar Conta Específica */}
      <ResetContaSection contas={contas || []} userId={user?.id} queryClient={queryClient} />

      {/* Section 5: Projeção de Parcelas */}
      <ProjectInstallmentsSection userId={user?.id} queryClient={queryClient} />

      {/* Section 5: Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Estatísticas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-muted">
                  <span className="text-muted-foreground">Total transações:</span>{' '}
                  <strong>{stats.total}</strong>
                </div>
                <div className="p-2 rounded bg-muted">
                  <span className="text-muted-foreground">Parcelas futuras:</span>{' '}
                  <strong>{stats.futuras}</strong>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold mb-1">Por conta:</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(stats.byConta).map(([contaId, count]) => (
                    <Badge key={contaId} variant="outline" className="text-[10px]">
                      {getContaNome(contaId)}: {count as number}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold mb-1">Por mês:</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(stats.byMonth)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([month, count]) => (
                      <Badge key={month} variant="secondary" className="text-[10px]">
                        {month}: {count as number}
                      </Badge>
                    ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
