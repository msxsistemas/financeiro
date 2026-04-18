import { query } from '../db/index.js'

export default async function whatsappLogRoutes(app) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const { page = 1, limit = 50, source, status, start_date, end_date } = request.query

    const conditions = ['user_id = $1']
    const params = [userId]
    let idx = 2

    if (source) { conditions.push(`source = $${idx++}`); params.push(source) }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status) }
    if (start_date) { conditions.push(`created_at >= $${idx++}`); params.push(start_date) }
    if (end_date) { conditions.push(`created_at <= $${idx++}::date + INTERVAL '1 day'`); params.push(end_date) }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const where = conditions.join(' AND ')

    const countRes = await query(`SELECT COUNT(*) FROM whatsapp_log WHERE ${where}`, params)
    const result = await query(
      `SELECT * FROM whatsapp_log WHERE ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit), offset]
    )

    return {
      data: result.rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit))
    }
  })

  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    await query('DELETE FROM whatsapp_log WHERE id = $1 AND user_id = $2', [id, request.user.id])
    return { ok: true }
  })
}
