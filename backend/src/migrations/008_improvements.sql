-- Vinculação de transações a contas
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

-- Flag de conciliação bancária
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciliation_ref VARCHAR(100) DEFAULT NULL;

-- Onboarding completo
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Comissão no PDV (campos já existem da migration 006, garantindo)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS commission_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

-- Índice para extrato por conta
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, paid_date, due_date);
