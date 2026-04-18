-- Migration 003: Novas features

-- 2FA nos usuários
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pix_key VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pix_key_type VARCHAR(50);

-- Parcelas automáticas nas dívidas
ALTER TABLE debts ADD COLUMN IF NOT EXISTS parent_debt_id UUID REFERENCES debts(id) ON DELETE CASCADE;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS installment_number INTEGER;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS total_installments INTEGER;

-- Vínculo produto-transação (saída de estoque ao vender)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS product_quantity INTEGER;

-- Controle de backups
CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(500) NOT NULL,
  size_bytes BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debts_parent ON debts(parent_debt_id);
CREATE INDEX IF NOT EXISTS idx_transactions_product ON transactions(product_id);
