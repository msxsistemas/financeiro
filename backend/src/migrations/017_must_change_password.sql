-- Flag para forçar troca de senha no primeiro login
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- Admin padrão sempre começa obrigado a trocar a senha
UPDATE users SET must_change_password = TRUE
WHERE email = 'admin@financeiro.com'
  AND password_hash = '$2b$10$rOzMpw7MUxS9VkZqNJ.7TOKFjsVWsxhqPMw/LKSiM3wXG0VJxKXxW';
