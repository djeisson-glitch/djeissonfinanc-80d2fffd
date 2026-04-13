-- Contas a pagar e receber: lançamentos manuais de compromissos futuros
CREATE TABLE IF NOT EXISTS contas_pagar_receber (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('pagar', 'receber')),
  vencimento DATE NOT NULL,
  pago BOOLEAN NOT NULL DEFAULT false,
  mes TEXT NOT NULL, -- YYYY-MM
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contas_pagar_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own bills" ON contas_pagar_receber
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
