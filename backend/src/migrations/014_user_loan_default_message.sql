-- Mensagem padrão de cobrança de empréstimo por usuário
ALTER TABLE users ADD COLUMN IF NOT EXISTS loan_default_message TEXT;
