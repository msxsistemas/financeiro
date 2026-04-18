#!/bin/bash
echo "Applying migration 006..."
docker exec -i financeiro_postgres psql -U financeiro_user financeiro < /var/www/financeiro/backend/src/migrations/006_extras2.sql
echo "Applying migration 007..."
docker exec -i financeiro_postgres psql -U financeiro_user financeiro < /var/www/financeiro/backend/src/migrations/007_loans.sql
echo "Applying migration 008..."
docker exec -i financeiro_postgres psql -U financeiro_user financeiro < /var/www/financeiro/backend/src/migrations/008_improvements.sql
echo "All migrations done"
