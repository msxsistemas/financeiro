FROM node:20-alpine

WORKDIR /app

# Instalar curl para healthcheck
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3001

CMD ["node", "src/server.js"]
