import bcrypt from 'bcrypt'
import { query, logActivity } from '../db/index.js'

async function requireAdmin(request, reply) {
  const r = await query('SELECT role FROM users WHERE id = $1', [request.user.id])
  if (r.rows[0]?.role !== 'admin') {
    return reply.code(403).send({ error: 'Acesso restrito a administradores' })
  }
}

export default async function adminRoutes(app) {
  // ───── Estatísticas globais ─────
  app.get('/stats', { preHandler: [app.authenticate, requireAdmin] }, async () => {
    const [users, transactions, debts, loans, iptvClients] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE active = TRUE)::int AS active FROM users`),
      query(`SELECT COUNT(*)::int AS total FROM transactions WHERE deleted_at IS NULL`),
      query(`SELECT COUNT(*)::int AS total FROM debts WHERE deleted_at IS NULL`),
      query(`SELECT COUNT(*)::int AS total FROM loans WHERE deleted_at IS NULL`),
      query(`SELECT COUNT(*)::int AS total FROM iptv_my_clients`).catch(() => ({ rows: [{ total: 0 }] }))
    ])

    // DB size
    let dbSize = null
    try {
      const r = await query(`SELECT pg_database_size(current_database()) AS size`)
      dbSize = parseInt(r.rows[0].size)
    } catch {}

    // Top atividade recente
    const recent = await query(`
      SELECT a.*, u.name AS user_name
      FROM activity_log a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT 20
    `).catch(() => ({ rows: [] }))

    return {
      users: users.rows[0],
      transactions: transactions.rows[0].total,
      debts: debts.rows[0].total,
      loans: loans.rows[0].total,
      iptv_clients: iptvClients.rows[0].total,
      db_size_bytes: dbSize,
      recent_activity: recent.rows
    }
  })

  // ───── Usuários ─────
  app.get('/users', { preHandler: [app.authenticate, requireAdmin] }, async (request) => {
    const { search } = request.query
    const conditions = ['1=1']
    const params = []
    let idx = 1
    if (search) {
      conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx})`)
      params.push(`%${search}%`)
      idx++
    }
    const r = await query(`
      SELECT id, name, email, role, active, must_change_password, totp_enabled,
        last_login_at, created_at,
        (SELECT COUNT(*) FROM transactions WHERE user_id = users.id AND deleted_at IS NULL) AS transactions_count,
        (SELECT COUNT(*) FROM debts WHERE user_id = users.id AND deleted_at IS NULL) AS debts_count
      FROM users
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `, params)
    return { data: r.rows, total: r.rows.length }
  })

  app.post('/users', { preHandler: [app.authenticate, requireAdmin] }, async (request, reply) => {
    const { name, email, password, role } = request.body
    if (!name || !email || !password) return reply.code(400).send({ error: 'Nome, email e senha são obrigatórios' })
    if (password.length < 6) return reply.code(400).send({ error: 'Senha deve ter ao menos 6 caracteres' })

    const exists = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
    if (exists.rows[0]) return reply.code(409).send({ error: 'Email já cadastrado' })

    const hash = await bcrypt.hash(password, 10)
    const r = await query(`
      INSERT INTO users (name, email, password_hash, role, must_change_password)
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING id, name, email, role, active, created_at
    `, [name, email.toLowerCase(), hash, ['admin', 'user', 'operator', 'viewer'].includes(role) ? role : 'user'])

    await logActivity(request.user.id, 'ADMIN_CREATE_USER', 'user', r.rows[0].id, `Usuário criado: ${email}`)
    return reply.code(201).send(r.rows[0])
  })

  app.put('/users/:id', { preHandler: [app.authenticate, requireAdmin] }, async (request, reply) => {
    const { id } = request.params
    const { name, email, role, active } = request.body

    if (id === request.user.id && active === false) {
      return reply.code(400).send({ error: 'Você não pode desativar a própria conta' })
    }

    const fields = []
    const values = []
    let idx = 1
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name) }
    if (email !== undefined) { fields.push(`email = $${idx++}`); values.push(email.toLowerCase()) }
    if (role !== undefined) { fields.push(`role = $${idx++}`); values.push(['admin', 'user', 'operator', 'viewer'].includes(role) ? role : 'user') }
    if (active !== undefined) { fields.push(`active = $${idx++}`); values.push(!!active) }

    if (fields.length === 0) return reply.code(400).send({ error: 'Nada a atualizar' })

    values.push(id)
    const r = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, email, role, active`,
      values
    )
    if (!r.rows[0]) return reply.code(404).send({ error: 'Usuário não encontrado' })
    await logActivity(request.user.id, 'ADMIN_UPDATE_USER', 'user', id, `Usuário atualizado: ${r.rows[0].email}`)
    return r.rows[0]
  })

  app.post('/users/:id/reset-password', { preHandler: [app.authenticate, requireAdmin] }, async (request, reply) => {
    const { id } = request.params
    const { password } = request.body
    if (!password || password.length < 6) {
      return reply.code(400).send({ error: 'Senha deve ter ao menos 6 caracteres' })
    }
    const hash = await bcrypt.hash(password, 10)
    const r = await query(
      'UPDATE users SET password_hash = $1, must_change_password = TRUE WHERE id = $2 RETURNING email',
      [hash, id]
    )
    if (!r.rows[0]) return reply.code(404).send({ error: 'Usuário não encontrado' })
    await logActivity(request.user.id, 'ADMIN_RESET_PASSWORD', 'user', id, `Senha resetada: ${r.rows[0].email}`)
    return { ok: true }
  })

  app.delete('/users/:id', { preHandler: [app.authenticate, requireAdmin] }, async (request, reply) => {
    const { id } = request.params
    if (id === request.user.id) {
      return reply.code(400).send({ error: 'Você não pode deletar a própria conta' })
    }
    const r = await query('DELETE FROM users WHERE id = $1 RETURNING email', [id])
    if (!r.rows[0]) return reply.code(404).send({ error: 'Usuário não encontrado' })
    await logActivity(request.user.id, 'ADMIN_DELETE_USER', 'user', id, `Usuário deletado: ${r.rows[0].email}`)
    return { ok: true }
  })

  // ───── Activity log paginado ─────
  app.get('/activity', { preHandler: [app.authenticate, requireAdmin] }, async (request) => {
    const { page = 1, limit = 50, user_id, action } = request.query
    const conditions = ['1=1']
    const params = []
    let idx = 1
    if (user_id) { conditions.push(`a.user_id = $${idx++}`); params.push(user_id) }
    if (action) { conditions.push(`a.action = $${idx++}`); params.push(action) }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const r = await query(`
      SELECT a.*, u.name AS user_name, u.email AS user_email
      FROM activity_log a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, parseInt(limit), offset])
    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM activity_log a WHERE ${conditions.join(' AND ')}`,
      params
    )
    return { data: r.rows, total: countRes.rows[0].total, page: parseInt(page) }
  })
}
