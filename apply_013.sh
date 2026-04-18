#!/bin/bash
# Aplicar migration 013 - Custom message em empréstimos
set -e
echo "Aplicando migration 013_loans_custom_message.sql..."
docker exec -i financeiro_postgres psql -U financeiro_user -d financeiro < /var/www/financeiro/backend/src/migrations/013_loans_custom_message.sql
echo "Migration 013 aplicada com sucesso!"
