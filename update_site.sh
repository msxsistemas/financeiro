#!/bin/bash
# Atualiza o site com as mudanças (rodar na VPS em /var/www/financeiro)
set -e

BASE=/var/www/financeiro
cd "$BASE"

echo "=== Atualizando Financeiro MSX ==="

# 1. Rodar migration nova (idempotente - ALTER COLUMN IF NOT EXISTS)
echo "→ Aplicando migration 013..."
docker exec -i financeiro_postgres psql -U financeiro_user -d financeiro < "$BASE/backend/src/migrations/013_loans_custom_message.sql"

# 2. Reiniciar backend (pega as novas rotas de iptv.js e loans.js)
echo "→ Reiniciando API..."
cd "$BASE/backend"
npm install --production
npx pm2 restart financeiro-api

# 3. Rebuild frontend
echo "→ Build do frontend..."
cd "$BASE/frontend"
npm install
npm run build

echo ""
echo "=== Atualização concluída! ==="
echo "Logs da API:  npx pm2 logs financeiro-api"
echo "Frontend em:  $BASE/frontend/dist"
