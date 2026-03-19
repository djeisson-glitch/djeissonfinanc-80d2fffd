-- 1. Add ignorar_dashboard column to transacoes
ALTER TABLE public.transacoes ADD COLUMN ignorar_dashboard boolean NOT NULL DEFAULT false;

-- 2. Create categorias table
CREATE TABLE public.categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  icone text,
  cor text,
  parent_id uuid REFERENCES public.categorias(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, nome, parent_id)
);

-- Enable RLS
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Users manage own categories" ON public.categorias
  FOR ALL TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Add categoria_id to transacoes (nullable for now, will populate later)
ALTER TABLE public.transacoes ADD COLUMN categoria_id uuid REFERENCES public.categorias(id);

-- 4. Add categoria_id to regras_categorizacao
ALTER TABLE public.regras_categorizacao ADD COLUMN categoria_id uuid REFERENCES public.categorias(id);