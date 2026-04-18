-- Migration 010: Cost center field + soft delete

-- Centro de custo / projeto nas transações
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cost_center VARCHAR(100);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS project VARCHAR(100);

-- Soft delete nas tabelas principais
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Índices para soft delete (queries sempre filtrarão deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_debts_deleted_at ON debts(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_cost_center ON transactions(cost_center) WHERE cost_center IS NOT NULL;
