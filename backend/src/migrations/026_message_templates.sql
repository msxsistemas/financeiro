-- 026_message_templates.sql
-- Templates personalizáveis de mensagens WhatsApp por usuário.
-- `loan_default_message` (migration 014) segue sendo o template de "parcela a vencer".
ALTER TABLE users ADD COLUMN IF NOT EXISTS loan_overdue_message TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS loan_overdue_multi_message TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS delinquent_message TEXT;
