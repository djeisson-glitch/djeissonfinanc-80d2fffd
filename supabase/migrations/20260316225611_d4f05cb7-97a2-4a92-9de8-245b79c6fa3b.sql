
-- Create update_updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Table: configuracoes
CREATE TABLE public.configuracoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receita_mensal_fixa NUMERIC NOT NULL DEFAULT 13000,
  reserva_minima NUMERIC NOT NULL DEFAULT 2000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own config" ON public.configuracoes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_configuracoes_updated_at BEFORE UPDATE ON public.configuracoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table: contas
CREATE TABLE public.contas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('credito', 'debito')),
  saldo_inicial NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own accounts" ON public.contas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_contas_user_id ON public.contas(user_id);

-- Table: transacoes
CREATE TABLE public.transacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conta_id UUID NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Outros',
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  essencial BOOLEAN NOT NULL DEFAULT false,
  parcela_atual INTEGER,
  parcela_total INTEGER,
  grupo_parcela UUID,
  hash_transacao TEXT NOT NULL,
  pessoa TEXT NOT NULL DEFAULT 'Djeisson Mauss',
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transactions" ON public.transacoes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_transacoes_user_id ON public.transacoes(user_id);
CREATE INDEX idx_transacoes_data ON public.transacoes(data);
CREATE INDEX idx_transacoes_conta_id ON public.transacoes(conta_id);
CREATE UNIQUE INDEX idx_transacoes_hash ON public.transacoes(user_id, hash_transacao);

-- Table: regras_categorizacao
CREATE TABLE public.regras_categorizacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  padrao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  essencial BOOLEAN NOT NULL DEFAULT false,
  aprendido_auto BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.regras_categorizacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own rules" ON public.regras_categorizacao FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_regras_user_id ON public.regras_categorizacao(user_id);
