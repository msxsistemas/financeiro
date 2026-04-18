-- Adiciona campo de mensagem personalizada para cobrança automática de empréstimos
ALTER TABLE loans ADD COLUMN IF NOT EXISTS custom_message TEXT;
