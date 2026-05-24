import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/format';
import { fetchAllRows } from '@/lib/supabase-fetch';
import {
  detectRecurringForProjection,
  buildRecurringProjections,
  type RecurringTxInput,
} from '@/lib/recurring-projection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Repeat, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';

export function RecorrentesProjecao() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);

  const now = new Date();
  const ano = now.getFullYear();
  const mesAtual = `${ano}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: txs } = useQuery({
    queryKey: ['recorrentes-tx', user?.id],
    queryFn: async () => {
      const data = await fetchAllRows<RecurringTxInput>(() => supabase
        .from('transacoes')
        .select('data, descricao, valor, tipo, categoria, categoria_id, parcela_total, ignorar_dashboard, essencial, conta_id, pessoa')
        .eq('user_id', user!.id)
        .eq('tipo', 'despesa')
        .gte('data', `${ano - 1}-01-01`));
      return data;
    },
    enabled: !!user,
  });

  const candidates = useMemo(
    () => (txs ? detectRecurringForProjection(txs, ano, mesAtual) : []),
    [txs, ano, mesAtual],
  );

  // Por padrão, deixa selecionados os recorrentes essenciais (contas que tendem a repetir).
  const effectiveSelected = useMemo(() => {
    if (touched) return selected;
    return new Set(candidates.filter(c => c.essencial).map(c => c.chave));
  }, [touched, selected, candidates]);

  const toggle = (chave: string) => {
    const next = new Set(effectiveSelected);
    if (next.has(chave)) next.delete(chave);
    else next.add(chave);
    setSelected(next);
    setTouched(true);
  };

  const chosen = candidates.filter(c => effectiveSelected.has(c.chave));
  const totalLancamentos = chosen.reduce((s, c) => s + c.mesesFaltantes.length, 0);

  const lancarMutation = useMutation({
    mutationFn: async () => {
      const rows = buildRecurringProjections(user!.id, chosen);
      if (rows.length === 0) return 0;
      const { error } = await supabase
        .from('transacoes')
        .upsert(rows, { onConflict: 'user_id,hash_transacao' });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ['recorrentes-tx'] });
      queryClient.invalidateQueries({ queryKey: ['projecoes-transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['transacoes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`${n} lançamentos projetados no resto de ${ano}. Serão substituídos quando o lançamento real for importado.`);
      setSelected(new Set());
      setTouched(true);
    },
    onError: () => toast.error('Erro ao projetar os recorrentes'),
  });

  if (candidates.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" />
          Despesas recorrentes — lançar no resto do ano
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground -mt-1">
          Detectamos despesas que se repetem há 3+ meses. Selecione quais lançar nos meses
          que ainda faltam de {ano}. Cada uma entra como projeção e é substituída automaticamente
          quando o lançamento real for importado.
        </p>

        <div className="space-y-1.5">
          {candidates.map(c => (
            <label
              key={c.chave}
              className="flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
            >
              <Checkbox checked={effectiveSelected.has(c.chave)} onCheckedChange={() => toggle(c.chave)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{c.descricao}</span>
                  {c.essencial && <Badge variant="secondary" className="text-[10px]">essencial</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.categoria} · visto em {c.mesesVistos} meses · dia ~{c.diaDoMes} · faltam {c.mesesFaltantes.length} mês(es) em {ano}
                </p>
              </div>
              <span className="text-sm font-semibold shrink-0">{formatCurrency(c.valorMedio)}<span className="text-xs text-muted-foreground">/mês</span></span>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {chosen.length} selecionada(s) · <strong>{totalLancamentos}</strong> lançamentos · {formatCurrency(chosen.reduce((s, c) => s + c.valorMedio * c.mesesFaltantes.length, 0))} no total
          </p>
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            disabled={totalLancamentos === 0 || lancarMutation.isPending}
            onClick={() => lancarMutation.mutate()}
          >
            <CalendarPlus className="h-4 w-4" />
            {lancarMutation.isPending ? 'Lançando...' : `Lançar ${totalLancamentos > 0 ? totalLancamentos : ''}`.trim()}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
