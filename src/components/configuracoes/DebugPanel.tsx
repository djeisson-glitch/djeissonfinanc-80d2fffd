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
import { Bug, Search, BarChart3, Loader2, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

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
          .select('id, descricao, valor, pessoa, data, conta_id, parcela_atual, parcela_total, created_at, tipo')
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

      // Group key: for installments ignore date (month); for non-installments include month
      const coarseGroups: Record<string, any[]> = {};
      allTxs.forEach(t => {
        const pref = prefix15(t.descricao);
        const pessoa = normalize(t.pessoa);
        let key: string;
        if (isInstallment(t)) {
          // Installments: group by conta + pessoa + parcela + prefix (NO month)
          key = `INST|${t.conta_id}|${pessoa}|${t.parcela_atual}/${t.parcela_total}|${pref}`;
        } else {
          // Non-installments: group by conta + month + pessoa + prefix
          const month = t.data.substring(0, 7);
          key = `NORM|${t.conta_id}|${month}|${pessoa}|${pref}`;
        }
        if (!coarseGroups[key]) coarseGroups[key] = [];
        coarseGroups[key].push(t);
      });

      // Within each group, cluster by value tolerance ≤ R$ 1.00
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
            if (valDiff <= 1.0) {
              cluster.push(items[j]);
              assigned.add(j);
            }
          }
          if (cluster.length > 1) clusters.push(cluster);
        }

        clusters.forEach(cluster => {
          // Decide which to keep:
          // For installments: prefer non-auto-projected (real), then oldest
          // For non-installments: keep oldest
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
            key: `${prefix15(keepItem.descricao)}|${Math.round(Number(keepItem.valor))}|${keepItem.conta_id}`,
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

  const confirmDeleteDuplicates = async () => {
    if (!dedupGroups) return;
    setDedupDeleting(true);
    try {
      // Capture before-totals per conta+month for summary
      const affectedKeys = new Set<string>();
      dedupGroups.forEach(g => {
        g.items.forEach((item: any) => {
          affectedKeys.add(`${item.conta_id}|${item.data.substring(0, 7)}`);
        });
      });

      // Sum values being removed per conta+month
      const removedByKey: Record<string, number> = {};
      dedupGroups.forEach(g => {
        g.items.slice(1).forEach((item: any) => {
          const k = `${item.conta_id}|${item.data.substring(0, 7)}`;
          removedByKey[k] = (removedByKey[k] || 0) + Number(item.valor);
        });
      });

      const allIds = dedupGroups.flatMap(g => g.removeIds);
      for (let i = 0; i < allIds.length; i += 100) {
        const batch = allIds.slice(i, i + 100);
        await supabase.from('transacoes').delete().in('id', batch);
      }

      // Build summary
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
            Busca transações com descrição similar (&gt;80%), valor ±R$ 0,50, mesma pessoa, mesmo mês e mesma parcela. Mostra prévia antes de remover.
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
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Duplicatas Encontradas</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {totalToRemove} transações serão removidas, {totalToKeep} serão mantidas.
          </p>
          <ScrollArea className="flex-1 max-h-[50vh]">
            <div className="space-y-4 pr-4">
              {dedupGroups?.map((group, idx) => (
                <div key={group.key} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Grupo {idx + 1}: {group.descricao}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {formatCurrency(group.valor)} · {group.items.length} transações
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item: any) => {
                      const isKeep = item.id === group.keepId;
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-2 text-xs p-1.5 rounded ${
                            isKeep ? 'bg-emerald-500/10' : 'bg-destructive/10'
                          }`}
                        >
                          {isKeep ? (
                            <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                          ) : (
                            <X className="h-3 w-3 text-destructive shrink-0" />
                          )}
                          <span className="font-mono text-muted-foreground">{item.id.slice(0, 8)}</span>
                          <span>{item.data}</span>
                          <span className="text-muted-foreground">{formatCurrency(Number(item.valor))}</span>
                          <span className="ml-auto text-muted-foreground">
                            {isKeep ? 'mantém' : 'remove'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDedupModalOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDeleteDuplicates} disabled={dedupDeleting}>
              {dedupDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Remover {totalToRemove} duplicata(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section 4: Stats */}
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
