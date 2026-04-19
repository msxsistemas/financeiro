-- Push subscriptions (PWA)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);

-- Flags para evitar duplicação de lembretes
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS push_24h_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS push_2h_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE loan_installments ADD COLUMN IF NOT EXISTS push_overdue_sent_at TIMESTAMPTZ;
