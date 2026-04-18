-- Remove duplicatas de categorias (mantém apenas a mais antiga de cada nome+type+user)
DELETE FROM categories
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, name, type ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
    FROM categories
  ) t WHERE t.rn > 1
);

-- Constraint para evitar duplicação futura
ALTER TABLE categories
  DROP CONSTRAINT IF EXISTS categories_user_name_type_unique;
ALTER TABLE categories
  ADD CONSTRAINT categories_user_name_type_unique UNIQUE (user_id, name, type);
