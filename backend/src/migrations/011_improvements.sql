-- Migration 011: Security, Performance & Features improvements
-- Indexes, roles, duplicate detection, fiscal reports

-- ==========================================
-- PERFORMANCE: Database Indexes
-- ==========================================

-- Transactions: queries pesadas em reports, dashboard e cron jobs
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_status ON transactions(user_id, type, status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_paid_date ON transactions(user_id, paid_date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_due_date ON transactions(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_status_due ON transactions(user_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_recurrence ON transactions(is_recurring, recurrence_next_date) WHERE is_recurring = true;

-- Debts: queries de listagem, cron de vencidos, notificacoes
CREATE INDEX IF NOT EXISTS idx_debts_user_status ON debts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_debts_user_type_status ON debts(user_id, type, status);
CREATE INDEX IF NOT EXISTS idx_debts_due_date_status ON debts(due_date, status) WHERE status IN ('pending', 'overdue', 'partial');

-- Loans: queries de listagem e cron
CREATE INDEX IF NOT EXISTS idx_loans_user_status ON loans(user_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_installments_loan_id ON loan_installments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_installments_user_paid ON loan_installments(user_id, paid);
CREATE INDEX IF NOT EXISTS idx_loan_installments_due_date ON loan_installments(due_date) WHERE NOT paid;

-- Products: listagem e estoque baixo
CREATE INDEX IF NOT EXISTS idx_products_user_active ON products(user_id, active);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);

-- Calendar events: cron de lembretes
CREATE INDEX IF NOT EXISTS idx_calendar_events_notify ON calendar_events(user_id, start_date) WHERE notify_whatsapp = true AND notified = false;

-- Activity log
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id, created_at DESC);

-- Budgets
CREATE INDEX IF NOT EXISTS idx_budgets_user_period ON budgets(user_id, month, year);

-- Categories
CREATE INDEX IF NOT EXISTS idx_categories_user_type ON categories(user_id, type);

-- ==========================================
-- FEATURES: Role system (admin, operator, viewer)
-- ==========================================

-- Garantir que a coluna role existe com default 'admin' para users existentes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'admin';
  END IF;
END $$;

-- Constraint para roles válidas
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_user_role') THEN
    ALTER TABLE users ADD CONSTRAINT check_user_role CHECK (role IN ('admin', 'operator', 'viewer'));
  END IF;
END $$;

-- ==========================================
-- FEATURES: Webhook secret para validação
-- ==========================================

-- Tabela de webhook secrets por user (para gateways de pagamento)
CREATE TABLE IF NOT EXISTS webhook_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  secret VARCHAR(255) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- ==========================================
-- FEATURES: Detecção de duplicatas
-- ==========================================

-- Index para detectar duplicatas (mesma descrição, valor, tipo e data)
CREATE INDEX IF NOT EXISTS idx_transactions_duplicate_check
  ON transactions(user_id, description, amount, type, due_date);

-- ==========================================
-- BACKUP: Melhorar tabela de backups
-- ==========================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'backups' AND column_name = 'type') THEN
    ALTER TABLE backups ADD COLUMN type VARCHAR(20) DEFAULT 'auto';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'backups' AND column_name = 'retention_days') THEN
    ALTER TABLE backups ADD COLUMN retention_days INTEGER DEFAULT 7;
  END IF;
END $$;
