CREATE TABLE public.historico_importacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL DEFAULT 'csv',
  conta_nome TEXT NOT NULL,
  conta_id UUID NOT NULL,
  qtd_importada INTEGER NOT NULL DEFAULT 0,
  qtd_duplicadas INTEGER NOT NULL DEFAULT 0,
  qtd_total INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.historico_importacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own import history"
  ON public.historico_importacoes
  FOR ALL
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);