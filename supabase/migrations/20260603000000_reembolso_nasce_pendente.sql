-- Reembolso vinculado nasce como receita PENDENTE (pago=false).
--
-- Por que: reembolso é PROMESSA de pagamento da outra pessoa, não pagamento
-- realizado. Antes a RPC criava a receita com default pago=true, que inflava
-- o saldo da conta antes mesmo da pessoa transferir o dinheiro.
--
-- Comportamento agora:
--   - despesa lançada: você gastou R$ 100 (despesa normal)
--   - reembolso marcado de Maiara: cria receita R$ 100 pago=false
--     → aparece em "Receitas previstas" do Hero
--     → aparece em "Próximos Vencimentos" (a receber)
--     → NÃO infla saldo da conta corrente até ela pagar
--   - Maiara transfere: user marca a receita como "Já recebi" (toggle no
--     editor de transação) → vira receita realizada → entra no saldo.
--
-- A RPC ganha parâmetro opcional `p_pago` (default false). Mantém compat
-- com clientes que não passam (assumem pendente).

DROP FUNCTION IF EXISTS public.criar_reembolso(UUID, UUID, TEXT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.criar_reembolso(
  p_despesa_id      UUID,
  p_conta_receita   UUID,
  p_pessoa          TEXT,
  p_valor           NUMERIC,
  p_pessoa_titular  TEXT,
  p_pago            BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_despesa      RECORD;
  v_desc_receita TEXT;
  v_hash         TEXT;
  v_receita_id   UUID;
BEGIN
  SELECT id, data, descricao, valor, conta_id, reembolso_transacao_id
    INTO v_despesa
    FROM public.transacoes
   WHERE id = p_despesa_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa % não encontrada ou sem permissão', p_despesa_id;
  END IF;

  IF v_despesa.reembolso_transacao_id IS NOT NULL THEN
    RAISE EXCEPTION 'Despesa % já tem reembolso vinculado — remova antes de criar outro', p_despesa_id;
  END IF;

  IF p_valor > v_despesa.valor THEN
    RAISE EXCEPTION 'Valor do reembolso (%) maior que o valor da despesa (%)', p_valor, v_despesa.valor;
  END IF;

  v_desc_receita := CONCAT('Reembolso de ', p_pessoa, ' - ', v_despesa.descricao);
  v_hash := CONCAT('reemb_', p_despesa_id::text, '_', extract(epoch from clock_timestamp())::text);

  INSERT INTO public.transacoes (
    user_id, conta_id, data, descricao, descricao_normalizada,
    valor, tipo, categoria, essencial, hash_transacao, pessoa,
    ignorar_dashboard, pago, observacoes
  ) VALUES (
    v_user_id, p_conta_receita, v_despesa.data, v_desc_receita,
    UPPER(REGEXP_REPLACE(v_desc_receita, '[^A-Za-z0-9 ]', '', 'g')),
    p_valor, 'receita', 'Reembolsos', false, v_hash, p_pessoa_titular,
    false, p_pago, CONCAT('Reembolso vinculado à despesa ', p_despesa_id::text)
  ) RETURNING id INTO v_receita_id;

  UPDATE public.transacoes
     SET reembolso_pessoa = p_pessoa,
         reembolso_valor = p_valor,
         reembolso_transacao_id = v_receita_id
   WHERE id = p_despesa_id;

  RETURN v_receita_id;
END;
$$;

-- DATA-MIGRATION: corrige reembolsos JÁ criados como pago=true antes desta
-- mudança. Eles inflavam o saldo antes da pessoa transferir. Marca como
-- pendente (pago=false) toda receita de reembolso que é apontada por alguma
-- despesa via reembolso_transacao_id. Idempotente — rodar 2x não causa dano.
UPDATE public.transacoes r
   SET pago = false
 WHERE r.tipo = 'receita'
   AND r.categoria = 'Reembolsos'
   AND r.pago = true
   AND EXISTS (
     SELECT 1 FROM public.transacoes d
      WHERE d.reembolso_transacao_id = r.id
        AND d.user_id = r.user_id
   );
