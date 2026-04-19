-- Atualiza constraint de role para aceitar 'user' (padrão usado pelo painel admin)
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_user_role;
ALTER TABLE users ADD CONSTRAINT check_user_role CHECK (role IN ('admin', 'user', 'operator', 'viewer'));
