import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTodayIso } from '@/hooks/useTodayIso';
import { formatCurrency } from '@/lib/format';
import { fetchAllRows } from '@/lib/supabase-fetch';
import { normalizeDescription, isFaturaPayment } from '@/lib/csv-parser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, AlertTriangle, Trash2, CalendarRange } from 'lucide-react';

interface Tx {
  id: string;
  conta_id: string;
  descricao: string;
  valor: number;
  tipo: string;
  data: string;
  mes_competencia: string | null;
  categoria: string | null;
}
interface Conta { id: string; nome: string; tipo: string; saldo_inicial: number | null; }

const MES_LABEL = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const compLabel = (yyyymm: string) => {
  const [y, m] = yyyymm.split('-');
  return `${MES_LABEL[Number(m)] || m}/${(y || '').slice(2)}`;
};

export default function ConciliacaoPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const todayIso = useTodayIso();

  const { data: contas } = useQuery({
    queryKey: ['contas', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contas').select('id, nome, tipo, saldo_inicial').eq('user_id', user!.id);
      return (data || []) as Conta[];
    },
    enabled: !!user,
  });

  const { data: txs } = useQuery({
    queryKey: ['conciliacao-txs', user?.id],
    queryFn: async () =>
      fetchAllRows<Tx>(() => supabase
        .from('transacoes')
        .select('id, conta_id, descricao, valor, tipo, data, mes_competencia, categoria')
        .eq('user_id', user!.id)),
    enabled: !!user,
  });

  const removeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('transacoes').delete().in('id', ids).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      queryClient.invalidateQueries({ queryKey: ['conciliacao-txs'] });
      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['saldos'] });
      queryClient.invalidateQueries({ queryKey: ['fatura-acumulada'] });
      toast({ title: `${ids.length} duplicata(s) removida(s)` });
    },
    onError: (e: any) => toast({ title: 'Erro ao remover', description: e?.message, variant: 'destructive' }),
  });

  const analise = useMemo(() => {
    if (!contas || !txs) return [];
    return contas.map((c) => {
      const list = txs.filter((t) => t.conta_id === c.id);

      // Saldo calculado (até hoje, ignora "Saldo Inicial" pra não duplicar o campo)
      let saldo = c.saldo_inicial || 0;
      for (const t of list) {
        if (t.categoria === 'Saldo Inicial') continue;
        if (t.data > todayIso) continue;
        saldo += t.tipo === 'receita' ? Number(t.valor) : -Number(t.valor);
      }

      // Duplicatas: mesma desc+valor+data+competência (exclui projeções)
      const groups: Record<string, Tx[]> = {};
      for (const t of list) {
        if (t.descricao.includes('(auto-projetada)')) continue;
        const k = `${normalizeDescription(t.descricao)}|${Number(t.valor).toFixed(2)}|${t.data}|${t.mes_competencia || '-'}`;
        (groups[k] ||= []).push(t);
      }
      const duplicatas = Object.values(groups)
        .filter((g) => g.length > 1)
        .map((g) => ({ amostra: g[0], extras: g.slice(1), total: g.length }));

      // Pagamentos de fatura repetidos (mesmo valor ~igual no mesmo mês)
      const pays = list.filter((t) => isFaturaPayment(t.descricao));
      const payGroups: Record<string, Tx[]> = {};
      for (const t of pays) {
        const k = `${(t.mes_competencia || t.data.substring(0, 7))}|${Number(t.valor).toFixed(2)}`;
        (payGroups[k] ||= []).push(t);
      }
      const pagamentosDup = Object.values(payGroups)
        .filter((g) => g.length > 1)
        .map((g) => ({ amostra: g[0], extras: g.slice(1), total: g.length }));

      // Cobertura de meses
      const meses = Array.from(new Set(list.map((t) => t.mes_competencia || t.data.substring(0, 7)))).sort();
      // Buracos entre o primeiro e o último mês
      const buracos: string[] = [];
      if (meses.length >= 2) {
        const [y0, m0] = meses[0].split('-').map(Number);
        const [y1, m1] = meses[meses.length - 1].split('-').map(Number);
        const set = new Set(meses);
        let y = y0, m = m0;
        while (y < y1 || (y === y1 && m <= m1)) {
          const key = `${y}-${String(m).padStart(2, '0')}`;
          if (!set.has(key)) buracos.push(key);
          m++; if (m > 12) { m = 1; y++; }
        }
      }

      return { conta: c, saldo, duplicatas, pagamentosDup, meses, buracos, total: list.length };
    });
  }, [contas, txs, todayIso]);

  const totalDup = analise.reduce((s, a) => s + a.duplicatas.length + a.pagamentosDup.length, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Conciliação</h1>
        <p className="text-sm text-muted-foreground">
          Confira o saldo de cada conta, duplicatas e meses faltando. {totalDup === 0 ? 'Nenhum problema detectado. ✅' : `${totalDup} ponto(s) de atenção.`}
        </p>
      </div>

      {analise.map(({ conta, saldo, duplicatas, pagamentosDup, meses, buracos, total }) => {
        const semProblema = duplicatas.length === 0 && pagamentosDup.length === 0;
        return (
          <Card key={conta.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  {semProblema ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  {conta.nome}
                  <Badge variant="secondary">{conta.tipo === 'credito' ? 'Cartão' : 'Conta'}</Badge>
                </span>
                <span className={`font-bold ${saldo >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {conta.tipo === 'credito' ? '—' : formatCurrency(saldo)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                <span>{total} lançamentos</span>
                {conta.tipo !== 'credito' && <span>Saldo inicial: {formatCurrency(conta.saldo_inicial || 0)}</span>}
              </div>

              {/* Cobertura de meses */}
              {meses.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <CalendarRange className="h-3.5 w-3.5" /> Meses com lançamento
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {meses.map((m) => <Badge key={m} variant="outline">{compLabel(m)}</Badge>)}
                    {buracos.map((m) => <Badge key={m} variant="destructive" className="opacity-80">falta {compLabel(m)}</Badge>)}
                  </div>
                </div>
              )}

              {/* Duplicatas */}
              {duplicatas.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-destructive">{duplicatas.length} grupo(s) de duplicata</p>
                  {duplicatas.map((d, i) => (
                    <div key={i} className="flex items-center justify-between rounded border p-2">
                      <span className="truncate">
                        <span className="text-muted-foreground">{d.total}x</span> {d.amostra.descricao} — {formatCurrency(Number(d.amostra.valor))} ({d.amostra.data})
                      </span>
                      <ConfirmDelete
                        onConfirm={() => removeMutation.mutate(d.extras.map((e) => e.id))}
                        title="Remover duplicatas?"
                        description={`Mantém 1 lançamento e remove os outros ${d.extras.length}. Não pode ser desfeito.`}
                        confirmLabel={`Remover ${d.extras.length}`}
                        trigger={
                          <Button size="sm" variant="ghost" className="text-destructive shrink-0">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Pagamentos de fatura repetidos */}
              {pagamentosDup.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-destructive">{pagamentosDup.length} pagamento(s) de fatura repetido(s)</p>
                  {pagamentosDup.map((d, i) => (
                    <div key={i} className="flex items-center justify-between rounded border p-2">
                      <span className="truncate">
                        <span className="text-muted-foreground">{d.total}x</span> {d.amostra.descricao} — {formatCurrency(Number(d.amostra.valor))}
                      </span>
                      <ConfirmDelete
                        onConfirm={() => removeMutation.mutate(d.extras.map((e) => e.id))}
                        title="Remover pagamentos repetidos?"
                        description={`Mantém 1 e remove os outros ${d.extras.length}. Não pode ser desfeito.`}
                        confirmLabel={`Remover ${d.extras.length}`}
                        trigger={
                          <Button size="sm" variant="ghost" className="text-destructive shrink-0">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              {semProblema && <p className="text-xs text-success">Sem duplicatas ou pagamentos repetidos. ✅</p>}
            </CardContent>
          </Card>
        );
      })}

      {analise.length === 0 && <p className="text-muted-foreground">Carregando…</p>}
    </div>
  );
}
