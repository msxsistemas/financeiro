import { query } from '../db/index.js'
import { MESSAGE_DEFAULTS, TEMPLATE_VARIABLES } from '../utils/messageTemplates.js'

// Mapeamento chave lógica -> coluna na tabela users
const COLUMN_MAP = {
  loan_upcoming: 'loan_default_message',
  loan_overdue: 'loan_overdue_message',
  loan_overdue_multi: 'loan_overdue_multi_message',
  delinquent: 'delinquent_message'
}

export default async function templatesRoutes(app) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const cols = Object.values(COLUMN_MAP).join(', ')
    const r = await query(`SELECT ${cols} FROM users WHERE id = $1`, [request.user.id])
    const row = r.rows[0] || {}
    const templates = {}
    for (const [key, col] of Object.entries(COLUMN_MAP)) {
      templates[key] = row[col] || ''
    }
    return {
      templates,
      defaults: MESSAGE_DEFAULTS,
      variables: TEMPLATE_VARIABLES
    }
  })

  app.put('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = request.body || {}
    const entries = Object.entries(COLUMN_MAP).filter(([key]) => key in body)
    if (entries.length === 0) return reply.code(400).send({ error: 'Nenhum template enviado' })

    const sets = entries.map(([, col], i) => `${col} = $${i + 1}`).join(', ')
    const params = entries.map(([key]) => {
      const v = body[key]
      return v && String(v).trim() ? String(v) : null
    })
    params.push(request.user.id)

    await query(`UPDATE users SET ${sets} WHERE id = $${params.length}`, params)
    return { ok: true }
  })
}
