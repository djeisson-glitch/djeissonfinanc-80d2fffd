-- =========================================================================
-- CONSOLIDATE DUPLICATE CATEGORIES
-- =========================================================================
-- Problem: o sistema tinha duas fontes de verdade para categorias
--   1. CATEGORIAS_CONFIG (types/database.types.ts) - usado no seed inicial
--   2. REQUIRED_CATEGORIES (lib/auto-categorize.ts)  - usado no CSV import
-- Com nomes divergentes (ex: "Assinatura" vs "Assinaturas"), o sistema
-- acabou criando categorias paralelas para cada usuário.
--
-- Esta migration:
--   1. Para cada usuário, identifica as duplicatas via mapeamento fixo
--   2. Move transacoes.categoria_id e regras_categorizacao.categoria_id e
--      grupos_parcela.categoria_id para a categoria canônica
--   3. Deleta as categorias duplicadas
--
-- Mapeamento duplicata -> canônica:
--   Assinaturas         -> Assinatura
--   Moradia             -> Casa
--   Compras Online      -> Compras
--   Tarifas Bancárias   -> Operação bancária
--   Pagamento de Fatura -> Operação bancária
--   Telecom             -> Serviços
--   Receita             -> Outras receitas
--   Impostos            -> Transporte (subcat "Imposto" - caso exista)
--   Combustível (top)   -> Transporte (subcat "Combustível" - caso exista)
--   Seguro de Vida      -> Saúde (subcat "Seguro de vida" - caso exista)
--   Seguro do Carro     -> Transporte (subcat "Seguro carro" - caso exista)
-- =========================================================================

-- Helper: remove acentos PT-BR (evita dependência da extension unaccent)
CREATE OR REPLACE FUNCTION public._pt_unaccent(input text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(
    input,
    'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
  );
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_from_id uuid;
  v_to_id uuid;
  v_pair RECORD;
BEGIN
  -- Loop por cada user_id que tem categorias
  FOR v_user_id IN SELECT DISTINCT user_id FROM public.categorias LOOP

    -- Pares (duplicata, canônica) para top-level
    FOR v_pair IN
      SELECT * FROM (VALUES
        ('Assinaturas',         'Assinatura'),
        ('Moradia',             'Casa'),
        ('Compras Online',      'Compras'),
        ('Tarifas Bancárias',   'Operação bancária'),
        ('Pagamento de Fatura', 'Operação bancária'),
        ('Telecom',             'Serviços'),
        ('Receita',             'Outras receitas'),
        ('Impostos',            'Transporte'),
        ('Combustível',         'Transporte'),
        ('Seguro de Vida',      'Saúde'),
        ('Seguro do Carro',     'Transporte')
      ) AS t(from_name, to_name)
    LOOP
      -- Pega o id da duplicata top-level (parent_id IS NULL)
      SELECT id INTO v_from_id
        FROM public.categorias
       WHERE user_id = v_user_id
         AND nome = v_pair.from_name
         AND parent_id IS NULL
       LIMIT 1;

      IF v_from_id IS NULL THEN CONTINUE; END IF;

      -- Garante que a canônica top-level exista para esse user
      SELECT id INTO v_to_id
        FROM public.categorias
       WHERE user_id = v_user_id
         AND nome = v_pair.to_name
         AND parent_id IS NULL
       LIMIT 1;

      -- Se a canônica não existir, renomeia a duplicata em vez de apagar
      IF v_to_id IS NULL THEN
        UPDATE public.categorias
           SET nome = v_pair.to_name
         WHERE id = v_from_id;
        CONTINUE;
      END IF;

      -- Não tenta mover para si mesma
      IF v_from_id = v_to_id THEN CONTINUE; END IF;

      -- Reassign transacoes
      UPDATE public.transacoes
         SET categoria_id = v_to_id
       WHERE user_id = v_user_id AND categoria_id = v_from_id;

      -- Reassign regras de categorização
      UPDATE public.regras_categorizacao
         SET categoria_id = v_to_id
       WHERE categoria_id = v_from_id;

      -- Reassign grupos_parcela
      UPDATE public.grupos_parcela
         SET categoria_id = v_to_id
       WHERE user_id = v_user_id AND categoria_id = v_from_id;

      -- Reassign eventuais subcategorias filhas
      UPDATE public.categorias
         SET parent_id = v_to_id
       WHERE user_id = v_user_id AND parent_id = v_from_id;

      -- Deleta a duplicata
      DELETE FROM public.categorias WHERE id = v_from_id;
    END LOOP;

    -- -------------------------------------------------------------------
    -- Consolidação case-insensitive / acento-insensitive para qualquer
    -- par remanescente que difira apenas por caixa ou acentuação.
    -- Mantém o registro com id mais antigo (created_at ASC).
    -- -------------------------------------------------------------------
    FOR v_pair IN
      SELECT canon_key, array_agg(id ORDER BY created_at) AS ids
        FROM (
          SELECT id, created_at,
                 lower(public._pt_unaccent(nome)) || '|' || COALESCE(parent_id::text, '') AS canon_key
            FROM public.categorias
           WHERE user_id = v_user_id
        ) x
       GROUP BY canon_key
      HAVING count(*) > 1
    LOOP
      v_to_id := v_pair.ids[1];
      FOR i IN 2..array_length(v_pair.ids, 1) LOOP
        v_from_id := v_pair.ids[i];

        UPDATE public.transacoes
           SET categoria_id = v_to_id
         WHERE user_id = v_user_id AND categoria_id = v_from_id;

        UPDATE public.regras_categorizacao
           SET categoria_id = v_to_id
         WHERE categoria_id = v_from_id;

        UPDATE public.grupos_parcela
           SET categoria_id = v_to_id
         WHERE user_id = v_user_id AND categoria_id = v_from_id;

        UPDATE public.categorias
           SET parent_id = v_to_id
         WHERE user_id = v_user_id AND parent_id = v_from_id;

        DELETE FROM public.categorias WHERE id = v_from_id;
      END LOOP;
    END LOOP;

  END LOOP;
END$$;

-- =========================================================================
-- Índice único case/acento-insensitive para evitar duplicatas futuras
-- =========================================================================
-- Observação: a constraint original UNIQUE(user_id, nome, parent_id) trata
-- "Assinatura" e "Assinaturas" como distintas. Este índice adicional bloqueia
-- variações de caixa e acentuação para o mesmo parent.
DROP INDEX IF EXISTS public.uniq_categorias_user_nome_norm;
CREATE UNIQUE INDEX uniq_categorias_user_nome_norm
  ON public.categorias (
    user_id,
    lower(public._pt_unaccent(nome)),
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

