-- Soft-delete em todas as entidades principais
ALTER TABLE loans ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_loans_deleted_at ON loans(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_deleted_at ON calendar_events(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_savings_goals_deleted_at ON savings_goals(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_deleted_at ON contacts(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at) WHERE deleted_at IS NULL;
