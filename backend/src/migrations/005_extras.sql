-- Meta de receita mensal (para planejamento)
CREATE TABLE IF NOT EXISTS monthly_income_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  target_income DECIMAL(12,2) NOT NULL DEFAULT 0,
  UNIQUE(user_id, month, year)
);

-- Divisão de contas
CREATE TABLE IF NOT EXISTS splits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  notes TEXT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS split_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  split_id UUID NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
  person_name VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMP,
  debt_id UUID REFERENCES debts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_splits_user_id ON splits(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_income_goals_user ON monthly_income_goals(user_id, month, year);
