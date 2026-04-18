#!/bin/bash
docker exec financeiro_postgres psql -U financeiro_user financeiro -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
