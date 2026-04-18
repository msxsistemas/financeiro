#!/bin/bash
echo "Applying migration 005..."
docker exec -i financeiro_postgres psql -U financeiro_user financeiro < /var/www/financeiro/backend/src/migrations/005_extras.sql
echo "Done"
pm2 restart financeiro-api
echo "API restarted"
