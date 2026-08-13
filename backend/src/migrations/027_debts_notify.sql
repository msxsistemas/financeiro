-- 027_debts_notify.sql
-- Notificação de vencimento em dívidas particulares:
--  * auto_notify / notify_days_before: cobrança automática via WhatsApp (igual empréstimos)
--  * push_due_sent_at: controle do push diário pro dono da conta (1x por dia)

ALTER TABLE debts ADD COLUMN IF NOT EXISTS auto_notify BOOLEAN DEFAULT true;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS notify_days_before INTEGER DEFAULT 0;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS push_due_sent_at TIMESTAMP;

-- Índice pro cron varrer só as dívidas em aberto com vencimento
CREATE INDEX IF NOT EXISTS idx_debts_due_open
  ON debts (due_date)
  WHERE deleted_at IS NULL AND status IN ('pending', 'partial', 'overdue');
