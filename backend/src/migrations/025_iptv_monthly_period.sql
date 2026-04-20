-- 025_iptv_monthly_period.sql
-- Cada revendedor/cliente IPTV passa a pertencer a um mês (YYYY-MM).
-- O faturamento/lucro é computado por período, permitindo "resetar" a
-- cada mês (o mês novo nasce vazio, o histórico dos meses anteriores
-- fica preservado).

ALTER TABLE iptv_resellers ADD COLUMN IF NOT EXISTS period VARCHAR(7);
ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS period VARCHAR(7);

-- Backfill: linhas existentes ficam no mês atual (não perder dados)
UPDATE iptv_resellers
  SET period = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
  WHERE period IS NULL OR period = '';
UPDATE iptv_my_clients
  SET period = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
  WHERE period IS NULL OR period = '';

-- Índices para filtro rápido por mês
CREATE INDEX IF NOT EXISTS idx_iptv_resellers_period ON iptv_resellers (user_id, period);
CREATE INDEX IF NOT EXISTS idx_iptv_my_clients_period ON iptv_my_clients (user_id, period);
