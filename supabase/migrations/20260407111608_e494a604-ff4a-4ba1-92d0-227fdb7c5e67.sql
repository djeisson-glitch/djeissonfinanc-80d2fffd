
-- Create installment groups table
CREATE TABLE public.grupos_parcela (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  descricao TEXT NOT NULL,
  total_parcelas INTEGER NOT NULL,
  valor_parcela NUMERIC NOT NULL,
  data_inicio DATE NOT NULL,
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  conta_id UUID REFERENCES public.contas(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.grupos_parcela ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own installment groups"
ON public.grupos_parcela
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add new columns to transacoes
ALTER TABLE public.transacoes 
  ADD COLUMN IF NOT EXISTS codigo_cartao TEXT,
  ADD COLUMN IF NOT EXISTS valor_dolar NUMERIC,
  ADD COLUMN IF NOT EXISTS descricao_normalizada TEXT;

-- Create deduplication index
CREATE INDEX IF NOT EXISTS idx_transacoes_dedup 
ON public.transacoes (user_id, descricao_normalizada, valor, parcela_atual, parcela_total);

-- Add foreign key from transacoes.grupo_parcela to grupos_parcela
-- (grupo_parcela column already exists as UUID)
