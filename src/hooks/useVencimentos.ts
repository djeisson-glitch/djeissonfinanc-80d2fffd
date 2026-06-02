/**
 * Hook compartilhado pra "próximos vencimentos".
 *
 * Usado por:
 *  - ProximosVencimentos (widget visual)
 *  - Dashboard hero (cálculo de "Disponível pra gastar hoje")
 *
 * React Query dedup a mesma queryKey, então 2 consumers = 1 round-trip.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTodayIso } from '@/hooks/useTodayIso';
import { fetchAllRows } from '@/lib/supabase-fetch';
import { construirVencimentos, calcularImpactoVencimentos } from '@/lib/vencimentos';

/**
 * @param ateNDias Janela em dias no futuro (default 30). Atrasados sempre entram.
 */
export function useVencimentos(ateNDias = 30) {
  const { user } = useAuth();
  const todayIso = useTodayIso();

  // Janela ampla nas queries; filtro fino fica em construirVencimentos.
  const { inicioRange, fimRange } = useMemo(() => {
    const [y, m, d] = todayIso.split('-').map(Number);
    const inicio = new Date(Date.UTC(y, m - 1, d - 90)).toISOString().slice(0, 10);
    const fim = new Date(Date.UTC(y, m - 1, d + 31)).toISOString().slice(0, 10);
    return { inicioRange: inicio, fimRange: fim };
  }, [todayIso]);

  // Pendentes em transações. Filtra pago=false client-side pra resiliência.
  const { data: txsPendentes } = useQuery({
    queryKey: ['vencimentos', 'transacoes', user?.id, inicioRange, fimRange],
    queryFn: async () => {
      const data = await fetchAllRows<{ id: string; descricao: string; valor: number; tipo: string; data: string; categoria: string | null; pago: boolean | null }>(
        () => supabase
          .from('transacoes')
          .select('id, descricao, valor, tipo, data, categoria, pago')
          .eq('user_id', user!.id)
          .gte('data', inicioRange)
          .lte('data', fimRange)
      );
      return data.filter(t => t.pago === false);
    },
    enabled: !!user,
  });

  const { data: cprPendentes } = useQuery({
    queryKey: ['vencimentos', 'cpr', user?.id, inicioRange, fimRange],
    queryFn: async () => {
      const { data } = await supabase
        .from('contas_pagar_receber')
        .select('id, descricao, valor, tipo, data_vencimento, categoria, pago')
        .eq('user_id', user!.id)
        .eq('pago', false)
        .gte('data_vencimento', inicioRange)
        .lte('data_vencimento', fimRange);
      return data || [];
    },
    enabled: !!user,
  });

  const vencimentos = useMemo(
    () => construirVencimentos(txsPendentes || [], (cprPendentes || []) as any, todayIso, ateNDias),
    [txsPendentes, cprPendentes, todayIso, ateNDias]
  );

  const impacto = useMemo(() => calcularImpactoVencimentos(vencimentos), [vencimentos]);

  return { vencimentos, impacto, isLoading: !txsPendentes || !cprPendentes };
}
