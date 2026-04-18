-- Adicionar telefone próprio para receber resumo semanal
ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS notify_phone VARCHAR(50);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  cpf_cnpj VARCHAR(50),
  type VARCHAR(20) DEFAULT 'client',
  notes TEXT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
