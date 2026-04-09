
CREATE TABLE public.simulacoes_financiamento (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL DEFAULT 'Simulação',
  valor_imovel NUMERIC NOT NULL,
  entrada NUMERIC NOT NULL,
  prazo_meses INTEGER NOT NULL,
  taxa_anual_nominal NUMERIC NOT NULL,
  tr_anual NUMERIC NOT NULL DEFAULT 0.5,
  itbi_percent NUMERIC NOT NULL DEFAULT 2.0,
  escritura_percent NUMERIC NOT NULL DEFAULT 2.0,
  renda_bruta NUMERIC NOT NULL,
  dividas_mensais NUMERIC NOT NULL DEFAULT 0,
  limite_comprometimento NUMERIC NOT NULL DEFAULT 30,
  capital_disponivel NUMERIC NOT NULL DEFAULT 0,
  reserva_meses INTEGER NOT NULL DEFAULT 7,
  aluguel_atual NUMERIC NOT NULL DEFAULT 0,
  condominio_atual NUMERIC NOT NULL DEFAULT 0,
  saldo_devedor_carro NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.simulacoes_financiamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own simulations"
ON public.simulacoes_financiamento
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_simulacoes_updated_at
BEFORE UPDATE ON public.simulacoes_financiamento
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
