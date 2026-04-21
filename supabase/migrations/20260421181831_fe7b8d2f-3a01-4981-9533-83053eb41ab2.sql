-- fontes_receita
CREATE TABLE public.fontes_receita (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fontes_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own fontes_receita" ON public.fontes_receita
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_fontes_receita_updated
  BEFORE UPDATE ON public.fontes_receita
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- contas_pagar_receber
CREATE TABLE public.contas_pagar_receber (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'pagar',
  mes TEXT NOT NULL,
  pago BOOLEAN NOT NULL DEFAULT false,
  data_vencimento DATE,
  categoria TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contas_pagar_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contas_pagar_receber" ON public.contas_pagar_receber
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_cpr_user_mes ON public.contas_pagar_receber(user_id, mes);
CREATE TRIGGER trg_cpr_updated
  BEFORE UPDATE ON public.contas_pagar_receber
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- planejamento_categorias
CREATE TABLE public.planejamento_categorias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  categoria_id UUID,
  categoria_nome TEXT NOT NULL,
  valor_planejado NUMERIC NOT NULL DEFAULT 0,
  mes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.planejamento_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own planejamento_categorias" ON public.planejamento_categorias
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_planejamento_user_mes ON public.planejamento_categorias(user_id, mes);
CREATE TRIGGER trg_planejamento_updated
  BEFORE UPDATE ON public.planejamento_categorias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();