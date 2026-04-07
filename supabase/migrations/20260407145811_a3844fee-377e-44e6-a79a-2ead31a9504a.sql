CREATE TABLE public.projecoes_manuais (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  mes text NOT NULL,
  categoria_id uuid REFERENCES public.categorias(id) ON DELETE SET NULL,
  categoria_nome text NOT NULL DEFAULT 'Outros',
  tipo text NOT NULL DEFAULT 'despesa',
  valor numeric NOT NULL,
  descricao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, mes, categoria_nome, tipo)
);

ALTER TABLE public.projecoes_manuais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own projections"
ON public.projecoes_manuais
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_projecoes_manuais_updated_at
BEFORE UPDATE ON public.projecoes_manuais
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();