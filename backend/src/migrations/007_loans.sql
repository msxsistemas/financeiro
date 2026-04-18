-- Módulo de Empréstimos / Agiotagem
CREATE TABLE IF NOT EXISTS loans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  principal_amount DECIMAL(12,2) NOT NULL,
  interest_rate DECIMAL(8,4) NOT NULL DEFAULT 0,       -- % por período (ex: 10 = 10%)
  interest_type VARCHAR(20) NOT NULL DEFAULT 'simple', -- simple | compound
  frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',    -- daily | weekly | monthly
  installments INTEGER NOT NULL DEFAULT 1,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  first_due_date DATE NOT NULL,
  late_fee_rate DECIMAL(8,4) NOT NULL DEFAULT 0,       -- % mora por período de atraso
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',        -- active | paid | defaulted
  auto_notify BOOLEAN DEFAULT false,
  notify_days_before INTEGER DEFAULT 1,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_installments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  principal_amount DECIMAL(12,2) NOT NULL,
  interest_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  late_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMP,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  last_notified_at TIMESTAMP,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(user_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_installments_loan ON loan_installments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_installments_due ON loan_installments(user_id, due_date, paid);
