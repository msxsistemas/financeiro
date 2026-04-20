-- 023_debts_recurring.sql
-- Dívidas recorrentes mensais: todo mês uma nova dívida é criada
-- no mesmo dia do vencimento original, até o usuário desmarcar.

ALTER TABLE debts ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS recurrence_next_date DATE;

-- Índice para o cron varrer só as recorrentes vencidas rapidamente
CREATE INDEX IF NOT EXISTS idx_debts_recurrence_next
  ON debts (recurrence_next_date)
  WHERE is_recurring = true AND deleted_at IS NULL;
