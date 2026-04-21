ALTER TABLE public.planejamento_categorias
  ADD CONSTRAINT planejamento_categorias_user_cat_mes_unique
  UNIQUE (user_id, categoria_nome, mes);