-- Migration 002: Melhorias

-- Campo last_notified_at nas dívidas (controla spam de notificações WhatsApp)
ALTER TABLE debts ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMP;

-- Transações recorrentes
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(20);
-- recurrence_type: 'daily', 'weekly', 'monthly', 'yearly'
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurrence_next_date DATE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

-- Metas por categoria
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(category_id, month, year, user_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions(user_id) WHERE is_recurring = true;
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id, year, month);
