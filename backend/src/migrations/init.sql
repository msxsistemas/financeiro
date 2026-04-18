-- Habilita extensões
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Categorias
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('income', 'expense')),
  color VARCHAR(7) DEFAULT '#6366f1',
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Transações financeiras
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description VARCHAR(500) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('income', 'expense')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  due_date DATE,
  paid_date DATE,
  notes TEXT,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Dívidas
CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description VARCHAR(500) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('payable', 'receivable')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  due_date DATE,
  paid_amount DECIMAL(15,2) DEFAULT 0,
  installments INTEGER DEFAULT 1,
  notes TEXT,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Pagamentos de dívidas
CREATE TABLE IF NOT EXISTS debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID REFERENCES debts(id) ON DELETE CASCADE,
  amount DECIMAL(15,2) NOT NULL,
  paid_at TIMESTAMP DEFAULT NOW(),
  notes TEXT,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE
);

-- Produtos
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(100),
  price DECIMAL(15,2) NOT NULL DEFAULT 0,
  cost DECIMAL(15,2) DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  unit VARCHAR(50) DEFAULT 'un',
  category VARCHAR(100),
  active BOOLEAN DEFAULT true,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Movimentações de estoque
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('in', 'out', 'adjustment')),
  quantity INTEGER NOT NULL,
  reason VARCHAR(500),
  reference VARCHAR(255),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Log de atividades
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100),
  entity_id UUID,
  description TEXT,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Configurações WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  server_url VARCHAR(500),
  instance_token VARCHAR(500),
  active BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Eventos de calendário
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  google_event_id VARCHAR(255),
  notify_whatsapp BOOLEAN DEFAULT false,
  notify_phone VARCHAR(50),
  reminder_minutes INTEGER DEFAULT 30,
  notified BOOLEAN DEFAULT false,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tokens Google OAuth
CREATE TABLE IF NOT EXISTS google_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  expiry_date BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id);
CREATE INDEX IF NOT EXISTS idx_debts_type ON debts(type);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_date);

-- Usuário admin padrão (senha: admin123 - trocar depois!)
INSERT INTO users (name, email, password_hash, role)
VALUES ('Administrador', 'admin@financeiro.com', '$2b$10$rOzMpw7MUxS9VkZqNJ.7TOKFjsVWsxhqPMw/LKSiM3wXG0VJxKXxW', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Categorias padrão
INSERT INTO categories (name, type, color, user_id)
SELECT 'Salário', 'income', '#22c55e', id FROM users WHERE email = 'admin@financeiro.com'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, type, color, user_id)
SELECT 'Vendas', 'income', '#3b82f6', id FROM users WHERE email = 'admin@financeiro.com'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, type, color, user_id)
SELECT 'Alimentação', 'expense', '#f59e0b', id FROM users WHERE email = 'admin@financeiro.com'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, type, color, user_id)
SELECT 'Moradia', 'expense', '#ef4444', id FROM users WHERE email = 'admin@financeiro.com'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, type, color, user_id)
SELECT 'Transporte', 'expense', '#8b5cf6', id FROM users WHERE email = 'admin@financeiro.com'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, type, color, user_id)
SELECT 'Outros', 'expense', '#6b7280', id FROM users WHERE email = 'admin@financeiro.com'
ON CONFLICT DO NOTHING;
