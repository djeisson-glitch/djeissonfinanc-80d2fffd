-- Reembolso por outra pessoa em uma despesa.
--
-- Caso de uso: Djeisson paga R$120 num restaurante com cartão dele, mas a Maiara
-- vai devolver R$50. A transação despesa fica como está (R$120 saindo do cartão),
-- e uma segunda transação receita é criada automaticamente (R$50 entrando como
-- "Reembolsos"). Os dois ficam vinculados via reembolso_transacao_id pra UI
-- mostrar a relação e deletar em cascata se a despesa principal for removida.
--
-- Colunas aditivas (todas nullable) — sem impacto em transações antigas.

ALTER TABLE public.transacoes
  ADD COLUMN IF NOT EXISTS reembolso_pessoa TEXT,
  ADD COLUMN IF NOT EXISTS reembolso_valor NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS reembolso_transacao_id UUID
    REFERENCES public.transacoes(id) ON DELETE SET NULL;

-- Index pra a UI conseguir buscar rapidamente "tem reembolso?" sem full scan.
CREATE INDEX IF NOT EXISTS idx_transacoes_reembolso_link
  ON public.transacoes(reembolso_transacao_id)
  WHERE reembolso_transacao_id IS NOT NULL;
