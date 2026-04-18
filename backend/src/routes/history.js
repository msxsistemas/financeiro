import { query } from '../db/index.js'

export default async function historyRoutes(app) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const { entity, action, start_date, end_date, page = 1, limit = 30 } = request.query

    const conditions = ['a.user_id = $1']
    const params = [userId]
    let idx = 2

    if (entity) { conditions.push(`a.entity = $${idx++}`); params.push(entity) }
    if (action) { conditions.push(`a.action = $${idx++}`); params.push(action) }
    if (start_date) { conditions.push(`a.created_at >= $${idx++}`); params.push(start_date) }
    if (end_date) { conditions.push(`a.created_at <= $${idx++}`); params.push(end_date + ' 23:59:59') }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const where = conditions.join(' AND ')

    const countRes = await query(`SELECT COUNT(*) FROM activity_log a WHERE ${where}`, params)
    const total = parseInt(countRes.rows[0].count)

    const result = await query(`
      SELECT a.*, u.name as user_name
      FROM activity_log a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE ${where}
      ORDER BY a.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, parseInt(limit), offset])

    return {
      data: result.rows,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    }
  })

  // Estatísticas
  app.get('/stats', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id

    const result = await query(`
      SELECT
        action,
        entity,
        COUNT(*) as count,
        MAX(created_at) as last_occurrence
      FROM activity_log
      WHERE user_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY action, entity
      ORDER BY count DESC
    `, [userId])

    return result.rows
  })
}
