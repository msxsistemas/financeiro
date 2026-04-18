import nodemailer from 'nodemailer'
import { query } from '../db/index.js'

let transporter = null

function getTransporter() {
  if (transporter) return transporter
  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT || '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  })
  return transporter
}

export async function sendEmail(to, subject, html, from) {
  const t = getTransporter()
  if (!t) throw new Error('SMTP nao configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS no .env')
  return t.sendMail({
    from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html
  })
}

export default async function emailRoutes(app) {

  // Enviar email avulso
  app.post('/send', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { to, subject, body } = request.body
    if (!to || !subject || !body) return reply.code(400).send({ error: 'to, subject e body sao obrigatorios' })

    try {
      await sendEmail(to, subject, body)
      await query(
        'INSERT INTO activity_log (user_id, action, entity_type, entity_id, description) VALUES ($1,$2,$3,$4,$5)',
        [request.user.id, 'EMAIL', 'email', null, `Email enviado para ${to}: ${subject}`]
      ).catch(() => {})
      return { success: true, message: `Email enviado para ${to}` }
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // Enviar relatorio mensal por email
  app.post('/report', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { to, month, year } = request.body
    if (!to) return reply.code(400).send({ error: 'Destinatario obrigatorio' })

    const userId = request.user.id
    const now = new Date()
    const m = parseInt(month || now.getMonth() + 1)
    const y = parseInt(year || now.getFullYear())
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end = new Date(y, m, 0).toISOString().split('T')[0]
    const monthName = new Date(y, m - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

    const userRes = await query('SELECT name FROM users WHERE id = $1', [userId])
    const userName = userRes.rows[0]?.name || 'Usuario'

    const [incomeRes, expenseRes] = await Promise.all([
      query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM transactions
        WHERE user_id=$1 AND type='income' AND status='completed' AND paid_date BETWEEN $2 AND $3`, [userId, start, end]),
      query(`SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM transactions
        WHERE user_id=$1 AND type='expense' AND status='completed' AND paid_date BETWEEN $2 AND $3`, [userId, start, end])
    ])

    const income = parseFloat(incomeRes.rows[0].total)
    const expense = parseFloat(expenseRes.rows[0].total)
    const balance = income - expense
    const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#4f46e5;color:white;padding:20px 30px;border-radius:12px 12px 0 0">
          <h1 style="margin:0;font-size:22px">Relatorio Financeiro</h1>
          <p style="margin:5px 0 0;opacity:0.9">${monthName} - ${userName}</p>
        </div>
        <div style="background:#f9fafb;padding:25px 30px;border:1px solid #e5e7eb">
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;width:33%">
                <div style="color:#15803d;font-size:12px;font-weight:600">RECEITAS</div>
                <div style="color:#15803d;font-size:20px;font-weight:700;margin-top:4px">${fmt(income)}</div>
                <div style="color:#86efac;font-size:11px">${incomeRes.rows[0].count} lancamentos</div>
              </td>
              <td style="padding:12px;background:#fef2f2;border-radius:8px;text-align:center;width:33%">
                <div style="color:#dc2626;font-size:12px;font-weight:600">DESPESAS</div>
                <div style="color:#dc2626;font-size:20px;font-weight:700;margin-top:4px">${fmt(expense)}</div>
                <div style="color:#fca5a5;font-size:11px">${expenseRes.rows[0].count} lancamentos</div>
              </td>
              <td style="padding:12px;background:${balance >= 0 ? '#eef2ff' : '#fff7ed'};border-radius:8px;text-align:center;width:33%">
                <div style="color:${balance >= 0 ? '#4338ca' : '#c2410c'};font-size:12px;font-weight:600">RESULTADO</div>
                <div style="color:${balance >= 0 ? '#4338ca' : '#c2410c'};font-size:20px;font-weight:700;margin-top:4px">${fmt(balance)}</div>
              </td>
            </tr>
          </table>
        </div>
        <div style="background:#f3f4f6;padding:15px 30px;border-radius:0 0 12px 12px;text-align:center;border:1px solid #e5e7eb;border-top:0">
          <p style="color:#9ca3af;font-size:11px;margin:0">Financeiro MSX - financeiro.msxsystem.site</p>
        </div>
      </div>
    `

    try {
      await sendEmail(to, `Relatorio Financeiro - ${monthName}`, html)
      return { success: true, message: `Relatorio enviado para ${to}` }
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // Status do SMTP
  app.get('/status', { preHandler: [app.authenticate] }, async () => {
    const t = getTransporter()
    if (!t) return { configured: false, message: 'SMTP nao configurado' }
    try {
      await t.verify()
      return { configured: true, message: 'SMTP conectado' }
    } catch (err) {
      return { configured: true, connected: false, error: err.message }
    }
  })
}
