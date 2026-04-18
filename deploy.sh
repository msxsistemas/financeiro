#!/bin/bash
# Script de deploy para VPS

set -e

echo "=== Deploy Financeiro MSX ==="

# 1. Subir PostgreSQL no Docker (isolado)
echo "→ Subindo banco de dados..."
docker-compose up -d postgres
echo "→ Aguardando PostgreSQL..."
sleep 5

# 2. Instalar dependências do backend
echo "→ Instalando dependências do backend..."
cd backend
npm install

# Criar .env se não existir
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  Arquivo .env criado. Edite as variáveis antes de continuar!"
  echo "   nano backend/.env"
fi

# Criar pasta de logs
mkdir -p logs

# 3. Iniciar backend com PM2
echo "→ Iniciando API com PM2..."
npx pm2 delete financeiro-api 2>/dev/null || true
npx pm2 start ecosystem.config.js
npx pm2 save

cd ..

# 4. Build do frontend
echo "→ Fazendo build do frontend..."
cd frontend
npm install
npm run build

echo ""
echo "=== Deploy concluído! ==="
echo ""
echo "📌 Configure o Nginx:"
echo "   - Frontend (financeiro.msxsystem.site) → aponta para: /caminho/frontend/dist"
echo "   - Backend (apifinanceiro.msxsystem.site) → proxy para: http://localhost:3001"
echo ""
echo "📌 Credenciais padrão:"
echo "   Email: admin@financeiro.com"
echo "   Senha: admin123 (TROQUE IMEDIATAMENTE!)"
echo ""
echo "📌 Próximos passos:"
echo "   1. Edite backend/.env com suas configurações"
echo "   2. Configure Nginx (veja nginx.conf)"
echo "   3. Instale SSL com certbot"
echo "   4. Configure Google Calendar (opcional)"
