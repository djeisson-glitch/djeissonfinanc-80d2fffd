-- Campos para modelar a venda do imóvel atual que financia a entrada da compra.
-- Aditivo e com DEFAULT 0 para não afetar simulações existentes.
ALTER TABLE public.simulacoes_financiamento
  ADD COLUMN IF NOT EXISTS valor_venda_imovel NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_devedor_imovel_vender NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iptu_atrasado NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ir_venda_estimado NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outros_custos_venda NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fgts_disponivel NUMERIC NOT NULL DEFAULT 0;
