-- Contas bancárias / carteiras
CREATE TABLE IF NOT EXISTS accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'checking',
  bank VARCHAR(255),
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  color VARCHAR(20) DEFAULT '#6366f1',
  icon VARCHAR(10) DEFAULT '🏦',
  active BOOLEAN DEFAULT true,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cartões de crédito
CREATE TABLE IF NOT EXISTS credit_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  limit_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  closing_day INTEGER NOT NULL DEFAULT 1,
  due_day INTEGER NOT NULL DEFAULT 10,
  color VARCHAR(20) DEFAULT '#8b5cf6',
  active BOOLEAN DEFAULT true,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_card_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  bill_month INTEGER NOT NULL,
  bill_year INTEGER NOT NULL,
  installments INTEGER NOT NULL DEFAULT 1,
  installment_number INTEGER NOT NULL DEFAULT 1,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  notes TEXT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_card_bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMP,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(card_id, month, year)
);

-- Metas de economia
CREATE TABLE IF NOT EXISTS savings_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  target_amount DECIMAL(12,2) NOT NULL,
  current_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  deadline DATE,
  color VARCHAR(20) DEFAULT '#22c55e',
  icon VARCHAR(10) DEFAULT '🎯',
  notes TEXT,
  completed BOOLEAN DEFAULT false,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tags para transações
CREATE TABLE IF NOT EXISTS tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#6366f1',
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(name, user_id)
);

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(transaction_id, tag_id)
);

-- Comissões no PDV
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS commission_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

-- Índices
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_cards_user ON credit_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_expenses_card ON credit_card_expenses(card_id, bill_month, bill_year);
CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON savings_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_tags ON transaction_tags(transaction_id);
