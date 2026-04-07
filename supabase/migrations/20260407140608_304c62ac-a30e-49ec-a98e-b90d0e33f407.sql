
-- Add data_abertura to contas
ALTER TABLE public.contas ADD COLUMN data_abertura date NOT NULL DEFAULT '2026-01-01';
