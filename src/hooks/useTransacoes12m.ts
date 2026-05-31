import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { fetchAllRows } from '@/lib/supabase-fetch';
import type { TransactionRecord } from '@/lib/projection-engine';

/**
 * Fetch de 12 meses de transações, cacheado e compartilhado entre Análises,
 * Projeções, Planejamento e Dívidas. Antes cada uma dessas páginas refazia a
 * mesma query (1.000+ linhas) no mount, com chaves diferentes — trocar de tab
 * disparava re-fetch desnecessário.
 *
 * staleTime de 2min: dentro desse intervalo, navegar entre tabs é instantâneo;
 * fora, refaz pra capturar imports/edições recentes.
 */
export function useTransacoes12m() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['transacoes-12m', user?.id],
    queryFn: async () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const startDate = `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}-01`;
      const data = await fetchAllRows<TransactionRecord>(() =>
        supabase
          .from('transacoes')
          .select('data, mes_competencia, descricao, valor, tipo, categoria, categoria_id, parcela_atual, parcela_total, grupo_parcela, ignorar_dashboard, essencial, conta_id')
          .eq('user_id', user!.id)
          .gte('data', startDate),
      );
      return data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}
