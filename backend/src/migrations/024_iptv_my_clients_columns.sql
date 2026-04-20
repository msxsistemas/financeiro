-- 024_iptv_my_clients_columns.sql
-- Garante que todas as colunas de iptv_my_clients existem, independente da
-- versão do schema quando a tabela foi criada originalmente.
-- Idempotente: só adiciona se faltar.

ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS credit_quantity INTEGER DEFAULT 1;
ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS sell_value NUMERIC(10,2) DEFAULT 0;
ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Preenche valores nulos que podem ter sobrado de versões anteriores
UPDATE iptv_my_clients SET sell_value = 0 WHERE sell_value IS NULL;
UPDATE iptv_my_clients SET credit_quantity = 1 WHERE credit_quantity IS NULL;
UPDATE iptv_my_clients SET status = 'active' WHERE status IS NULL;
