#!/bin/bash
echo "=== PRODUCTS COLUMNS ==="
docker exec -i financeiro_postgres psql -U financeiro_user financeiro < /tmp/prod_cols.sql
echo "=== MISSING TABLES ==="
docker exec -i financeiro_postgres psql -U financeiro_user financeiro < /tmp/check_tables.sql
