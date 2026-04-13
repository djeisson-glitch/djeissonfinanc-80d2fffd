-- Fontes de receita: substitui o campo receita_mensal_fixa por entradas individuais
CREATE TABLE IF NOT EXISTS fontes_receita (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fontes_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own income sources" ON fontes_receita
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Planejamento por categoria: metas mensais por categoria
CREATE TABLE IF NOT EXISTS planejamento_categorias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  valor_planejado NUMERIC NOT NULL DEFAULT 0,
  mes TEXT NOT NULL, -- YYYY-MM
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, categoria, mes)
);

ALTER TABLE planejamento_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own budget plans" ON planejamento_categorias
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
