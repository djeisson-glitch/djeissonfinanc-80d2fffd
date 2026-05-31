-- ============================================================================
-- Reembolso: RPC atômico + trigger CASCADE
-- ============================================================================
--
-- Antes:
--   - Criar reembolso era 2 chamadas separadas do front (INSERT receita +
--     UPDATE despesa). Se a rede caísse entre as duas, ficava receita órfã
--     contando como receita real no Dashboard.
--   - Deletar uma despesa com reembolso NÃO removia a receita pareada
--     (a FK self-ref tinha ON DELETE SET NULL na direção errada). Receita
--     órfã ficava somando.
--   - Deletar a RECEITA deixava a DESPESA com reembolso_pessoa/valor
--     preenchidos mas reembolso_transacao_id=null — estado dessincronizado.
--
-- Agora:
--   - RPC `criar_reembolso` faz INSERT receita + UPDATE despesa numa única
--     transação Postgres (ACID). Front chama 1 RPC.
--   - Trigger BEFORE DELETE em `transacoes`: se a despesa deletada tem
--     reembolso_transacao_id, deleta a receita ANTES. Se a receita deletada
--     tem despesa apontando pra ela, limpa os 3 campos da despesa.
--
-- Pre-condições: as colunas reembolso_pessoa/valor/transacao_id já existem
-- (migration 20260530120000).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) RPC criar_reembolso
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_reembolso(
  p_despesa_id      UUID,
  p_conta_receita   UUID,
  p_pessoa          TEXT,
  p_valor           NUMERIC,
  p_pessoa_titular  TEXT
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
  -- Carrega a despesa, conferindo RLS implícito (só dono mexe)
  SELECT id, data, descricao, valor, conta_id, reembolso_transacao_id
    INTO v_despesa
    FROM public.transacoes
   WHERE id = p_despesa_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa % não encontrada ou sem permissão', p_despesa_id;
  END IF;

  -- Idempotência: se já tem reembolso, exige remoção primeiro (a UI sabe disso)
  IF v_despesa.reembolso_transacao_id IS NOT NULL THEN
    RAISE EXCEPTION 'Despesa % já tem reembolso vinculado (%)', p_despesa_id, v_despesa.reembolso_transacao_id;
  END IF;

  -- Limite de segurança: valor do reembolso não pode exceder a despesa
  IF p_valor > v_despesa.valor THEN
    RAISE EXCEPTION 'Reembolso (R$ %) maior que a despesa (R$ %)', p_valor, v_despesa.valor;
  END IF;

  v_desc_receita := LEFT(
    CONCAT('Reembolso de ', p_pessoa, ' - ', v_despesa.descricao),
    200
  );
  -- Hash determinístico por despesa+valor — re-criar com mesmos dados produz o
  -- mesmo hash; combinado com a checagem de reembolso_transacao_id acima, evita
  -- duplicação e mantém audit.
  v_hash := 'reemb_' || REPLACE(p_despesa_id::text, '-', '') || '_' || REPLACE(p_valor::text, '.', '');

  INSERT INTO public.transacoes (
    user_id, conta_id, data, descricao, descricao_normalizada,
    valor, tipo, categoria, essencial, hash_transacao, pessoa,
    ignorar_dashboard, observacoes
  ) VALUES (
    v_user_id, p_conta_receita, v_despesa.data, v_desc_receita,
    UPPER(REGEXP_REPLACE(v_desc_receita, '[^A-Za-z0-9 ]', '', 'g')),
    p_valor, 'receita', 'Reembolsos', false, v_hash, p_pessoa_titular,
    false, CONCAT('Reembolso vinculado à despesa ', p_despesa_id::text)
  ) RETURNING id INTO v_receita_id;

  UPDATE public.transacoes
     SET reembolso_pessoa        = p_pessoa,
         reembolso_valor         = p_valor,
         reembolso_transacao_id  = v_receita_id
   WHERE id = p_despesa_id AND user_id = v_user_id;

  RETURN v_receita_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_reembolso(UUID, UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Trigger BEFORE DELETE — mantém integridade do par despesa↔receita
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_reembolso_cascade_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caso A: despesa principal sendo deletada → apaga a receita pareada.
  IF OLD.reembolso_transacao_id IS NOT NULL THEN
    DELETE FROM public.transacoes
     WHERE id = OLD.reembolso_transacao_id
       AND user_id = OLD.user_id;
  END IF;

  -- Caso B: receita sendo deletada → limpa os campos da despesa que apontava
  -- pra ela, pra UI não mostrar badge fantasma.
  UPDATE public.transacoes
     SET reembolso_pessoa = NULL,
         reembolso_valor = NULL,
         reembolso_transacao_id = NULL
   WHERE reembolso_transacao_id = OLD.id
     AND user_id = OLD.user_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_reembolso_cascade ON public.transacoes;
CREATE TRIGGER tg_reembolso_cascade
  BEFORE DELETE ON public.transacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_reembolso_cascade_delete();
