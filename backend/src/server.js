import 'dotenv/config'
const UAZAPI_URL = process.env.UAZAPI_URL
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import compress from '@fastify/compress'
import helmet from '@fastify/helmet'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import rateLimit from '@fastify/rate-limit'
import crypto from 'crypto'
import cron from 'node-cron'
import axios from 'axios'
import { db, query } from './db/index.js'
import authRoutes from './routes/auth.js'
import dashboardRoutes from './routes/dashboard.js'
import debtsRoutes from './routes/debts.js'
import whatsappRoutes from './routes/whatsapp.js'
import calendarRoutes from './routes/calendar.js'
import reportsRoutes from './routes/reports.js'
import notificationsRoutes from './routes/notifications.js'
import backupRoutes, { runBackup } from './routes/backup.js'
import contactsRoutes from './routes/contacts.js'
import goalsRoutes from './routes/goals.js'
import tagsRoutes from './routes/tags.js'
import loansRoutes from './routes/loans.js'
import delinquentsRoutes from './routes/delinquents.js'
import whatsappLogRoutes from './routes/whatsapp_log.js'
import iptvRoutes from './routes/iptv.js'
import emailRoutes from './routes/email.js'
import bulkRoutes from './routes/bulk.js'
import transactionsRoutes from './routes/transactions.js'
import productsRoutes from './routes/products.js'
import trashRoutes, { purgeOldTrash } from './routes/trash.js'

const app = Fastify({
  logger: { level: 'info' },
  ajv: { customOptions: { allErrors: true } }
})

// Permitir POST com body vazio (ex: /connect, /logout)
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    const json = body && body.length > 0 ? JSON.parse(body) : {}
    done(null, json)
  } catch (err) {
    done(err)
  }
})

// Gzip/Brotli compression (~70% reducao de payload)
await app.register(compress, { global: true })

// Security headers (Helmet)
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'https://financeiro.msxsystem.site', "https://apifinanceiro.msxsystem.site"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
})

// CORS dinamico via env var
const corsOrigins = process.env.CORS_WHITELIST
  ? process.env.CORS_WHITELIST.split(',').map(s => s.trim())
  : [
      process.env.FRONTEND_URL || 'https://financeiro.msxsystem.site',
      'http://localhost:3000',
      'http://localhost:5173'
    ]

await app.register(cors, {
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
})

// Cookie plugin (para httpOnly auth cookie)
await app.register(cookie, {
  secret: process.env.COOKIE_SECRET || process.env.JWT_SECRET,
  parseOptions: {}
})

// Rate Limiting por usuário (fallback por IP)
await app.register(rateLimit, {
  max: 300,
  timeWindow: '1 minute',
  keyGenerator: (request) => {
    try {
      const auth = request.headers.authorization
      if (auth?.startsWith('Bearer ')) {
        const decoded = app.jwt.decode(auth.split(' ')[1])
        if (decoded?.id) return `user_${decoded.id}`
      }
    } catch {}
    return request.ip
  },
  errorResponseBuilder: () => ({ error: 'Muitas requisições. Aguarde um momento.' })
})

// JWT
await app.register(jwt, {
  secret: process.env.JWT_SECRET || 'change_this_secret_in_production',
  cookie: {
    cookieName: 'fin_token',
    signed: false
  }
})

// Decorator de autenticação (suporta Bearer header + httpOnly cookie)
app.decorate('authenticate', async (request, reply) => {
  try {
    // Tentar header Authorization primeiro
    if (request.headers.authorization) {
      await request.jwtVerify()
      return
    }
    // Fallback para cookie httpOnly
    const cookieToken = request.cookies?.fin_token
    if (cookieToken) {
      request.headers.authorization = `Bearer ${cookieToken}`
      await request.jwtVerify()
      return
    }
    reply.code(401).send({ error: 'Token inválido ou expirado' })
  } catch (err) {
    reply.code(401).send({ error: 'Token inválido ou expirado' })
  }
})

// Swagger / OpenAPI docs
await app.register(swagger, {
  openapi: {
    info: {
      title: 'Financeiro MSX API',
      description: 'API do sistema financeiro MSX — transacoes, dividas, emprestimos, produtos, relatorios e mais.',
      version: '2.0.0'
    },
    servers: [{ url: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace('financeiro', 'apifinanceiro') : 'http://localhost:3001' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },
    security: [{ bearerAuth: [] }]
  }
})
await app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'list', deepLinking: false }
})

// Rotas
await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(dashboardRoutes, { prefix: '/api/dashboard' })
await app.register(debtsRoutes, { prefix: '/api/debts' })
await app.register(whatsappRoutes, { prefix: '/api/whatsapp' })
await app.register(calendarRoutes, { prefix: '/api/calendar' })
await app.register(reportsRoutes, { prefix: '/api/reports' })
await app.register(notificationsRoutes, { prefix: '/api/notifications' })
await app.register(backupRoutes, { prefix: '/api/backup' })
await app.register(contactsRoutes, { prefix: '/api/contacts' })

await app.register(goalsRoutes, { prefix: '/api/goals' })
await app.register(tagsRoutes, { prefix: '/api/tags' })
await app.register(loansRoutes, { prefix: '/api/loans' })
await app.register(delinquentsRoutes, { prefix: '/api/delinquents' })
await app.register(whatsappLogRoutes, { prefix: '/api/whatsapp-log' })
await app.register(iptvRoutes, { prefix: '/api/iptv' })
await app.register(emailRoutes, { prefix: '/api/email' })
await app.register(bulkRoutes, { prefix: '/api/bulk' })
await app.register(transactionsRoutes, { prefix: '/api/transactions' })
await app.register(productsRoutes, { prefix: '/api/products' })
await app.register(trashRoutes, { prefix: '/api/trash' })

// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

// Webhook de pagamento externo (gateways) - com verificação de assinatura
app.post('/api/webhooks/payment', async (request, reply) => {
  try {
    const { transaction_id, user_id, ref } = request.body
    if (!transaction_id || !user_id) return reply.code(400).send({ error: 'transaction_id e user_id são obrigatórios' })

    // Verificar assinatura do webhook (HMAC-SHA256)
    const signature = request.headers['x-webhook-signature']
    const webhookSecret = process.env.WEBHOOK_SECRET
    if (webhookSecret) {
      if (!signature) return reply.code(401).send({ error: 'Assinatura do webhook ausente' })
      const expectedSig = crypto.createHmac('sha256', webhookSecret)
        .update(JSON.stringify(request.body)).digest('hex')
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        app.log.warn({ ip: request.ip }, 'Webhook com assinatura inválida')
        return reply.code(401).send({ error: 'Assinatura inválida' })
      }
    }

    // Verificar que o user_id existe
    const userCheck = await query('SELECT id FROM users WHERE id = $1', [user_id])
    if (!userCheck.rows[0]) return reply.code(404).send({ error: 'Usuário não encontrado' })

    const result = await query(
      `UPDATE transactions SET status='completed', paid_date=CURRENT_DATE WHERE id=$1 AND user_id=$2 RETURNING id`,
      [transaction_id, user_id]
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'Transação não encontrada' })
    await query(`INSERT INTO activity_log (user_id, action, entity_type, entity_id, description) VALUES ($1,'WEBHOOK','transaction',$2,$3)`,
      [user_id, transaction_id, `Pagamento via webhook${ref ? ` ref:${ref}` : ''}`]).catch(() => {})
    app.log.info({ transaction_id, user_id }, 'Webhook de pagamento processado')
    return { received: true, transaction_id }
  } catch (err) {
    app.log.error(err, 'Erro no webhook de pagamento')
    return reply.code(500).send({ error: 'Erro interno' })
  }
})

// ─── CRON JOBS ────────────────────────────────────────────────

// A cada minuto: lembretes de eventos via WhatsApp
cron.schedule('* * * * *', async () => {
  try {
    const events = await query(`
      SELECT ce.*, ws.instance_token, u.calendar_default_message AS user_default_message
      FROM calendar_events ce
      JOIN whatsapp_settings ws ON ws.user_id = ce.user_id
      JOIN users u ON u.id = ce.user_id
      WHERE ce.notify_whatsapp = true
        AND ce.notified = false
        AND ce.notify_phone IS NOT NULL
        AND ws.instance_token IS NOT NULL AND ws.instance_token != ''
        AND ce.start_date <= NOW() + (ce.reminder_minutes || ' minutes')::interval
        AND ce.start_date > NOW()
    `)

    for (const event of events.rows) {
      try {
        const cleanPhone = event.notify_phone.replace(/\D/g, '')
        const d = new Date(event.start_date)
        const data = d.toLocaleDateString('pt-BR')
        const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        const template = event.custom_message || event.user_default_message
        const descSuffix = event.description ? '\n📝 ' + event.description : ''
        const message = template
          ? template
              .replace(/\{titulo\}/g, event.title || '')
              .replace(/\{data\}/g, data)
              .replace(/\{hora\}/g, hora)
              .replace(/\{descricao\}/g, descSuffix)
          : `🔔 *Lembrete:* ${event.title}\n📅 ${data} às ${hora}${descSuffix}`

        await axios.post(`${UAZAPI_URL}/send/text`, {
          number: cleanPhone, text: message
        }, { headers: { token: event.instance_token }, timeout: 10000 })

        await query('UPDATE calendar_events SET notified = true WHERE id = $1', [event.id])
      } catch (err) {
        app.log.error({ eventId: event.id, err: err.message }, 'Erro no lembrete de evento')
      }
    }
  } catch (err) {
    app.log.error({ err: err.message }, 'Erro no cron de lembretes')
  }
})

// Diariamente às 8h: marcar dívidas vencidas + notificar via WhatsApp
cron.schedule('0 8 * * *', async () => {
  try {
    // Marcar como vencidas
    const updated = await query(`
      UPDATE debts SET status = 'overdue', updated_at = NOW()
      WHERE due_date < CURRENT_DATE AND status = 'pending'
    `)
    if (updated.rowCount > 0) app.log.info(`${updated.rowCount} dívidas marcadas como vencidas`)

    // Notificar credores/devedores via WhatsApp (máx 1x por dia)
    const debtsToNotify = await query(`
      SELECT d.*, ws.instance_token
      FROM debts d
      JOIN whatsapp_settings ws ON ws.user_id = d.user_id
      WHERE d.status IN ('overdue', 'partial')
        AND d.contact_phone IS NOT NULL
        AND d.type = 'receivable'
        AND ws.instance_token IS NOT NULL AND ws.instance_token != ''
        AND (d.last_notified_at IS NULL OR d.last_notified_at < CURRENT_DATE)
    `)

    for (const debt of debtsToNotify.rows) {
      try {
        const remaining = parseFloat(debt.amount) - parseFloat(debt.paid_amount)
        const dueDate = new Date(debt.due_date).toLocaleDateString('pt-BR')
        const cleanPhone = debt.contact_phone.replace(/\D/g, '')
        const message = `Olá ${debt.contact_name || ''}! 👋\n\nLembrando sobre o valor de *R$ ${remaining.toFixed(2).replace('.', ',')}* referente a: *${debt.description}*\n\nVencimento: ${dueDate}\n\nQualquer dúvida, estou à disposição! 😊`

        await axios.post(`${UAZAPI_URL}/send/text`, {
          number: cleanPhone, text: message
        }, { headers: { token: debt.instance_token }, timeout: 10000 })

        await query('UPDATE debts SET last_notified_at = NOW() WHERE id = $1', [debt.id])
        app.log.info(`Notificação de dívida enviada para ${cleanPhone}`)
      } catch (err) {
        app.log.error({ debtId: debt.id, err: err.message }, 'Erro na notificação de dívida')
      }
    }
  } catch (err) {
    app.log.error({ err: err.message }, 'Erro no cron diário de dívidas')
  }
})

// Toda segunda-feira às 8h: resumo semanal via WhatsApp
cron.schedule('0 8 * * 1', async () => {
  try {
    // Usar datas em horário local para evitar desvio de fuso
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const toLocalDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const lastMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
    const weekStart = toLocalDate(lastMonday)
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const weekEnd = toLocalDate(yesterday)

    // Buscar usuários com WhatsApp configurado
    const users = await query(`
      SELECT DISTINCT ws.user_id, ws.instance_token, ws.notify_phone,
        u.name as user_name
      FROM whatsapp_settings ws
      JOIN users u ON u.id = ws.user_id
      WHERE ws.notify_phone IS NOT NULL
        AND ws.instance_token IS NOT NULL AND ws.instance_token != ''
    `)

    for (const user of users.rows) {
      try {
        const [incomeRes, expenseRes, overdueRes, lowStockRes] = await Promise.all([
          query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM transactions
            WHERE user_id=$1 AND type='income' AND status='completed'
            AND paid_date BETWEEN $2 AND $3`, [user.user_id, weekStart, weekEnd]),
          query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM transactions
            WHERE user_id=$1 AND type='expense' AND status='completed'
            AND paid_date BETWEEN $2 AND $3`, [user.user_id, weekStart, weekEnd]),
          query(`SELECT COUNT(*) as count FROM debts
            WHERE user_id=$1 AND status IN ('overdue','partial') AND type='payable'`, [user.user_id]),
          query(`SELECT COUNT(*) as count FROM products
            WHERE user_id=$1 AND active=true AND stock_quantity <= min_stock AND min_stock > 0`, [user.user_id])
        ])

        const income = parseFloat(incomeRes.rows[0].total)
        const expense = parseFloat(expenseRes.rows[0].total)
        const balance = income - expense
        const overdue = parseInt(overdueRes.rows[0].count)
        const lowStock = parseInt(lowStockRes.rows[0].count)
        const fmtVal = (v) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`

        const weekStartFmt = new Date(weekStart + 'T12:00:00').toLocaleDateString('pt-BR')
        const weekEndFmt = new Date(weekEnd + 'T12:00:00').toLocaleDateString('pt-BR')

        let msg = `📊 *Resumo Semanal — Financeiro MSX*\n`
        msg += `📅 ${weekStartFmt} a ${weekEndFmt}\n\n`
        msg += `📈 Receitas: *${fmtVal(income)}* (${incomeRes.rows[0].count} lançamentos)\n`
        msg += `📉 Despesas: *${fmtVal(expense)}* (${expenseRes.rows[0].count} lançamentos)\n`
        msg += `💰 Resultado: *${balance >= 0 ? '+' : ''}${fmtVal(balance)}*\n`
        if (overdue > 0) msg += `\n⚠️ Dívidas a pagar vencidas: *${overdue}*`
        if (lowStock > 0) msg += `\n📦 Produtos com estoque baixo: *${lowStock}*`
        msg += `\n\n_financeiro.msxsystem.site_`

        await axios.post(`${UAZAPI_URL}/send/text`, {
          number: user.notify_phone, text: msg
        }, { headers: { token: user.instance_token }, timeout: 10000 })

        app.log.info(`Resumo semanal enviado para usuário ${user.user_id}`)
      } catch (err) {
        app.log.error({ userId: user.user_id, err: err.message }, 'Erro no resumo semanal')
      }
    }
  } catch (err) {
    app.log.error({ err: err.message }, 'Erro no cron de resumo semanal')
  }
})

// Diariamente às 8h30: cobranças automáticas de empréstimos via WhatsApp
cron.schedule('30 8 * * *', async () => {
  try {
    const today = new Date().toISOString().split('T')[0]

    // Buscar usuários com notificação automática ativa
    const usersRes = await query(`
      SELECT DISTINCT l.user_id, ws.instance_token
      FROM loans l
      JOIN whatsapp_settings ws ON ws.user_id = l.user_id
      WHERE l.status = 'active' AND l.auto_notify = true
        AND ws.instance_token IS NOT NULL AND ws.instance_token != ''
    `)

    for (const user of usersRes.rows) {
      try {
        // 1. Aplicar mora em parcelas vencidas
        const overdueRes = await query(`
          SELECT li.*, l.late_fee_rate, l.frequency
          FROM loan_installments li
          JOIN loans l ON l.id = li.loan_id
          WHERE li.user_id = $1 AND NOT li.paid AND li.due_date < $2 AND l.late_fee_rate > 0
        `, [user.user_id, today])

        for (const inst of overdueRes.rows) {
          const rate = parseFloat(inst.late_fee_rate) / 100
          const dueDate = new Date(inst.due_date)
          const todayDate = new Date(today)
          const diffMs = todayDate - dueDate
          let periods = 1
          if (inst.frequency === 'daily') periods = Math.floor(diffMs / (1000 * 60 * 60 * 24))
          else if (inst.frequency === 'weekly') periods = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7))
          else periods = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30))
          periods = Math.max(1, periods)
          const lateFee = parseFloat(inst.total_amount) * rate * periods
          await query('UPDATE loan_installments SET late_fee_amount = $1 WHERE id = $2', [lateFee.toFixed(2), inst.id])
        }

        // 2. Enviar lembretes para parcelas próximas do vencimento
        const upcomingRes = await query(`
          SELECT li.*, l.contact_name, l.contact_phone, l.notify_days_before
          FROM loan_installments li
          JOIN loans l ON l.id = li.loan_id
          WHERE li.user_id = $1 AND NOT li.paid AND l.auto_notify = true AND l.status = 'active'
            AND li.due_date = (CURRENT_DATE + (l.notify_days_before || ' days')::INTERVAL)::DATE
            AND (li.last_notified_at IS NULL OR li.last_notified_at::DATE < CURRENT_DATE)
        `, [user.user_id])

        for (const inst of upcomingRes.rows) {
          if (!inst.contact_phone) continue
          const cleanPhone = inst.contact_phone.replace(/\D/g, '')
          const fmt = (v) => `R$ ${parseFloat(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
          const dueDate = new Date(inst.due_date).toLocaleDateString('pt-BR')
          const total = parseFloat(inst.total_amount) + parseFloat(inst.late_fee_amount || 0)
          const msg = `Olá ${inst.contact_name || ''}! 👋\n\nLembrete: sua parcela *${inst.installment_number}* vence amanhã em *${dueDate}*.\n\n💰 Valor: *${fmt(total)}*\n\nEvite atrasos!\n\n_financeiro.msxsystem.site_`
          try {
            await axios.post(`${UAZAPI_URL}/send/text`, { number: cleanPhone, text: msg }, {
              headers: { token: user.instance_token }, timeout: 10000
            })
            await query('UPDATE loan_installments SET last_notified_at = NOW() WHERE id = $1', [inst.id])
            app.log.info(`Lembrete de parcela enviado: ${inst.contact_name} - parcela ${inst.installment_number}`)
          } catch (err) {
            app.log.error({ instId: inst.id, err: err.message }, 'Erro ao enviar lembrete de parcela')
          }
        }

        // 3. Enviar cobranças de parcelas vencidas (não notificadas hoje)
        const overdueNotifyRes = await query(`
          SELECT li.*, l.contact_name, l.contact_phone
          FROM loan_installments li
          JOIN loans l ON l.id = li.loan_id
          WHERE li.user_id = $1 AND NOT li.paid AND l.auto_notify = true AND l.status = 'active'
            AND li.due_date < $2
            AND (li.last_notified_at IS NULL OR li.last_notified_at::DATE < CURRENT_DATE)
        `, [user.user_id, today])

        // Agrupar por loan/contato
        const byLoan = {}
        for (const inst of overdueNotifyRes.rows) {
          if (!inst.contact_phone) continue
          if (!byLoan[inst.loan_id]) byLoan[inst.loan_id] = { contact_name: inst.contact_name, contact_phone: inst.contact_phone, items: [] }
          byLoan[inst.loan_id].items.push(inst)
        }

        for (const [loanId, group] of Object.entries(byLoan)) {
          const cleanPhone = group.contact_phone.replace(/\D/g, '')
          const fmt = (v) => `R$ ${parseFloat(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
          const totalOverdue = group.items.reduce((s, i) => s + parseFloat(i.total_amount) + parseFloat(i.late_fee_amount || 0), 0)
          let msg = `Olá ${group.contact_name || ''}! ⚠️\n\n*${group.items.length} parcela(s) em atraso:*\n\n`
          for (const inst of group.items) {
            const dd = new Date(inst.due_date).toLocaleDateString('pt-BR')
            const tot = parseFloat(inst.total_amount) + parseFloat(inst.late_fee_amount || 0)
            msg += `• Parcela ${inst.installment_number} — ${dd} — *${fmt(tot)}*\n`
          }
          msg += `\n💸 Total: *${fmt(totalOverdue)}*\n\nPor favor regularize o pagamento.\n\n_financeiro.msxsystem.site_`
          try {
            await axios.post(`${UAZAPI_URL}/send/text`, { number: cleanPhone, text: msg }, {
              headers: { token: user.instance_token }, timeout: 10000
            })
            const ids = group.items.map(i => i.id)
            await query(`UPDATE loan_installments SET last_notified_at = NOW() WHERE id = ANY($1)`, [ids])
            app.log.info(`Cobrança de atraso enviada: ${group.contact_name} (${group.items.length} parcelas)`)
          } catch (err) {
            app.log.error({ loanId, err: err.message }, 'Erro ao enviar cobrança de empréstimo')
          }
        }
      } catch (err) {
        app.log.error({ userId: user.user_id, err: err.message }, 'Erro no cron de empréstimos')
      }
    }
  } catch (err) {
    app.log.error({ err: err.message }, 'Erro no cron de empréstimos')
  }
})

// Diariamente às 9h: alertas de orçamento (budget) via WhatsApp
cron.schedule('0 9 * * *', async () => {
  try {
    const now = new Date()
    const m = now.getMonth() + 1
    const y = now.getFullYear()
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end = new Date(y, m, 0).toISOString().split('T')[0]

    const users = await query(`
      SELECT DISTINCT ws.user_id, ws.instance_token, ws.notify_phone, u.name
      FROM whatsapp_settings ws
      JOIN users u ON u.id = ws.user_id
      WHERE ws.notify_phone IS NOT NULL
        AND ws.instance_token IS NOT NULL AND ws.instance_token != ''
    `)

    for (const user of users.rows) {
      try {
        const budgetsRes = await query(`
          SELECT b.amount as budget, c.name as category,
            COALESCE(SUM(t.amount), 0) as spent
          FROM budgets b
          JOIN categories c ON b.category_id = c.id
          LEFT JOIN transactions t ON t.category_id = c.id
            AND t.type = 'expense' AND t.status = 'completed'
            AND t.paid_date BETWEEN $2 AND $3 AND t.user_id = $1
          WHERE b.user_id = $1 AND b.month = $4 AND b.year = $5
          GROUP BY b.amount, c.name
          HAVING COALESCE(SUM(t.amount), 0) >= b.amount * 0.85
        `, [user.user_id, start, end, m, y])

        if (budgetsRes.rows.length === 0) continue

        const fmt = (v) => `R$ ${parseFloat(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
        let msg = `⚠️ *Alerta de Orçamento — ${new Date(y, m - 1, 1).toLocaleString('pt-BR', { month: 'long' })}*\n\n`
        for (const b of budgetsRes.rows) {
          const pct = parseFloat(b.budget) > 0 ? (parseFloat(b.spent) / parseFloat(b.budget) * 100) : 0
          const icon = pct >= 100 ? '🔴' : '🟡'
          msg += `${icon} *${b.category}*: ${fmt(b.spent)} / ${fmt(b.budget)} (${pct.toFixed(0)}%)\n`
        }
        msg += `\n_financeiro.msxsystem.site_`

        await axios.post(`${UAZAPI_URL}/send/text`, {
          number: user.notify_phone.replace(/\D/g, ''), text: msg
        }, { headers: { token: user.instance_token }, timeout: 10000 })

        app.log.info(`Alertas de orçamento enviados para ${user.user_id}`)
      } catch (err) {
        app.log.error({ userId: user.user_id, err: err.message }, 'Erro nos alertas de orçamento')
      }
    }
  } catch (err) {
    app.log.error({ err: err.message }, 'Erro no cron de alertas de orçamento')
  }
})

// Diariamente às 3h: backup automático
cron.schedule('0 3 * * *', async () => {
  try {
    await runBackup()
  } catch (err) {
    app.log.error({ err: err.message }, 'Erro no backup automático')
  }
})

// Diariamente às 4h: purga permanente de itens na lixeira há mais de 30 dias
cron.schedule('0 4 * * *', async () => {
  try {
    const n = await purgeOldTrash()
    if (n > 0) app.log.info(`Purga: ${n} item(s) removidos permanentemente da lixeira`)
  } catch (err) {
    app.log.error({ err: err.message }, 'Erro na purga de lixeira')
  }
})

// Diariamente à meia-noite: criar transações recorrentes
cron.schedule('0 0 * * *', async () => {
  try {
    const today = new Date().toISOString().split('T')[0]

    const recurring = await query(`
      SELECT * FROM transactions
      WHERE is_recurring = true
        AND recurrence_next_date <= $1
        AND status != 'cancelled'
    `, [today])

    for (const tx of recurring.rows) {
      try {
        // Criar próxima ocorrência
        const newTx = await query(`
          INSERT INTO transactions (description, amount, type, status, category_id, due_date, notes, user_id, is_recurring, recurrence_type, recurrence_parent_id)
          VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, false, null, $8)
          RETURNING id
        `, [tx.description, tx.amount, tx.type, tx.category_id, tx.recurrence_next_date, tx.notes, tx.user_id, tx.id])

        // Calcular próxima data — parse ao meio-dia local para evitar desvio de fuso UTC
        const parts = String(tx.recurrence_next_date).substring(0, 10).split('-')
        let nextDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0)
        switch (tx.recurrence_type) {
          case 'daily': nextDate.setDate(nextDate.getDate() + 1); break
          case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break
          case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break
          case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break
        }
        const pad2 = n => String(n).padStart(2, '0')
        const nextDateStr = `${nextDate.getFullYear()}-${pad2(nextDate.getMonth() + 1)}-${pad2(nextDate.getDate())}`

        await query('UPDATE transactions SET recurrence_next_date = $1 WHERE id = $2',
          [nextDateStr, tx.id])

        app.log.info(`Transação recorrente criada: ${tx.description}`)
      } catch (err) {
        app.log.error({ txId: tx.id, err: err.message }, 'Erro na transação recorrente')
      }
    }
  } catch (err) {
    app.log.error({ err: err.message }, 'Erro no cron de recorrentes')
  }
})

// ─── START ────────────────────────────────────────────────────
const start = async () => {
  try {
    await db.query('SELECT 1')
    app.log.info('Banco de dados conectado')

    const port = parseInt(process.env.PORT || '3001')
    await app.listen({ port, host: '0.0.0.0' })
    app.log.info(`Servidor rodando na porta ${port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
