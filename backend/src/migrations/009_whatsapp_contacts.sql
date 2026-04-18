-- Migration 009: WhatsApp log + contacts custom fields

-- WhatsApp message log
CREATE TABLE IF NOT EXISTS whatsapp_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone VARCHAR(30) NOT NULL,
  contact_name VARCHAR(255),
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'sent', -- sent, failed
  source VARCHAR(50), -- delinquents, loan, debt, manual
  source_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_user ON whatsapp_log(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_created ON whatsapp_log(created_at DESC);

-- Contacts: add address and additional fields
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS state VARCHAR(50);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);
