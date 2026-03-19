import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CATEGORIAS_CONFIG } from '@/types/database.types';

export interface Categoria {
  id: string;
  user_id: string;
  nome: string;
  icone: string | null;
  cor: string | null;
  parent_id: string | null;
  created_at: string;
}

export function useCategorias() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: categorias, isLoading } = useQuery({
    queryKey: ['categorias', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias')
        .select('*')
        .eq('user_id', user!.id)
        .order('nome');
      if (error) throw error;
      return (data || []) as Categoria[];
    },
    enabled: !!user,
  });

  const parents = categorias?.filter(c => !c.parent_id) || [];
  const children = (parentId: string) => categorias?.filter(c => c.parent_id === parentId) || [];

  const getCategoriaById = (id: string | null) => categorias?.find(c => c.id === id) || null;

  const getParentForCategoria = (id: string | null): Categoria | null => {
    if (!id) return null;
    const cat = getCategoriaById(id);
    if (!cat) return null;
    if (cat.parent_id) return getCategoriaById(cat.parent_id);
    return cat;
  };

  const getDisplayName = (id: string | null): string => {
    if (!id) return 'Sem categoria';
    const cat = getCategoriaById(id);
    if (!cat) return 'Sem categoria';
    if (cat.parent_id) {
      const parent = getCategoriaById(cat.parent_id);
      return parent ? `${parent.nome} › ${cat.nome}` : cat.nome;
    }
    return cat.nome;
  };

  const getColor = (id: string | null): string => {
    if (!id) return '#9ca3af';
    const cat = getCategoriaById(id);
    if (!cat) return '#9ca3af';
    if (cat.cor) return cat.cor;
    if (cat.parent_id) {
      const parent = getCategoriaById(cat.parent_id);
      return parent?.cor || '#9ca3af';
    }
    return '#9ca3af';
  };

  const seedCategorias = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // Check if already seeded
      const { count } = await supabase
        .from('categorias')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (count && count > 0) return; // Already seeded

      const parentInserts: { user_id: string; nome: string; cor: string; parent_id: null }[] = [];
      const childMap: Record<string, string[]> = {};

      for (const [nome, config] of Object.entries(CATEGORIAS_CONFIG)) {
        parentInserts.push({
          user_id: user.id,
          nome,
          cor: config.cor,
          parent_id: null,
        });
        if (config.subcategorias.length > 0) {
          childMap[nome] = config.subcategorias;
        }
      }

      const { data: insertedParents, error: parentError } = await supabase
        .from('categorias')
        .insert(parentInserts)
        .select();

      if (parentError) throw parentError;

      const childInserts: { user_id: string; nome: string; cor: string | null; parent_id: string }[] = [];
      for (const parent of insertedParents || []) {
        const subs = childMap[parent.nome];
        if (subs) {
          for (const sub of subs) {
            childInserts.push({
              user_id: user.id,
              nome: sub,
              cor: null,
              parent_id: parent.id,
            });
          }
        }
      }

      if (childInserts.length > 0) {
        const { error: childError } = await supabase.from('categorias').insert(childInserts);
        if (childError) throw childError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
    },
  });

  return {
    categorias: categorias || [],
    parents,
    children,
    getCategoriaById,
    getParentForCategoria,
    getDisplayName,
    getColor,
    isLoading,
    seedCategorias,
  };
}
