import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Hook that fetches fontes_receita and calculates the total active income.
 * Falls back to config.receita_mensal_fixa when no fontes_receita exist yet
 * (backward compatibility).
 */
export function useFontesReceita() {
  const { user } = useAuth();

  const { data: fontes, isLoading, refetch } = useQuery({
    queryKey: ['fontes-receita', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fontes_receita')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: config } = useQuery({
    queryKey: ['config', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('configuracoes')
        .select('*')
        .eq('user_id', user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const fontesAtivas = (fontes || []).filter((f: any) => f.ativo);
  const totalReceita = fontesAtivas.reduce((s: number, f: any) => s + Number(f.valor), 0);

  // Backward compatibility: use config.receita_mensal_fixa if no fontes_receita configured
  const receitaBase = totalReceita > 0
    ? totalReceita
    : (config?.receita_mensal_fixa || 13000);

  return {
    fontes: fontes || [],
    fontesAtivas,
    totalReceita,
    receitaBase,
    isLoading,
    refetch,
  };
}
