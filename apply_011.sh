#!/bin/bash
# Aplicar migration 011 - Melhorias de segurança, performance e features
echo "Aplicando migration 011_improvements.sql..."
docker exec -i financeiro_postgres psql -U financeiro_user -d financeiro < backend/src/migrations/011_improvements.sql
echo "Migration 011 aplicada com sucesso!"
