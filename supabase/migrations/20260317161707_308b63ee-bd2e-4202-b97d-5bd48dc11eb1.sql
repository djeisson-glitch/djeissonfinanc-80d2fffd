
-- Add data_original and mes_competencia columns to transacoes
ALTER TABLE public.transacoes ADD COLUMN data_original date;
ALTER TABLE public.transacoes ADD COLUMN mes_competencia text;

-- Backfill: set data_original = data for existing rows
UPDATE public.transacoes SET data_original = data WHERE data_original IS NULL;
