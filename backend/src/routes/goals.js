import { query, logActivity } from '../db/index.js'

export default async function goalsRoutes(app) {
  // Listar metas
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const result = await query(
      'SELECT * FROM savings_goals WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC',
      [userId]
    )
    return result.rows
  })

  // Criar meta
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { name, target_amount, current_amount, deadline, color, icon, notes } = request.body
    if (!name || !target_amount) return reply.code(400).send({ error: 'Nome e valor alvo são obrigatórios' })
    const result = await query(
      `INSERT INTO savings_goals (name, target_amount, current_amount, deadline, color, icon, notes, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, parseFloat(target_amount), parseFloat(current_amount) || 0,
       deadline || null, color || '#22c55e', icon || '🎯', notes || null, userId]
    )
    await logActivity(userId, 'CREATE', 'goal', result.rows[0].id, `Meta criada: ${name}`)
    return reply.code(201).send(result.rows[0])
  })

  // Atualizar meta
  app.put('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { name, target_amount, current_amount, deadline, color, icon, notes, completed } = request.body
    const result = await query(
      `UPDATE savings_goals SET name=$1, target_amount=$2, current_amount=$3, deadline=$4,
       color=$5, icon=$6, notes=$7, completed=$8
       WHERE id=$9 AND user_id=$10 AND deleted_at IS NULL RETURNING *`,
      [name, parseFloat(target_amount), parseFloat(current_amount) || 0,
       deadline || null, color || '#22c55e', icon || '🎯', notes || null,
       completed || false, request.params.id, userId]
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'Não encontrada' })
    return result.rows[0]
  })

  // Depositar (adicionar valor à meta)
  app.post('/:id/deposit', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { amount } = request.body
    if (!amount || parseFloat(amount) <= 0) return reply.code(400).send({ error: 'Valor inválido' })

    const result = await query(
      `UPDATE savings_goals
       SET current_amount = current_amount + $1,
           completed = (current_amount + $1 >= target_amount)
       WHERE id=$2 AND user_id=$3 AND deleted_at IS NULL RETURNING *`,
      [parseFloat(amount), request.params.id, userId]
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'Não encontrada' })
    return result.rows[0]
  })

  // Sacar (remover valor da meta)
  app.post('/:id/withdraw', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { amount } = request.body
    if (!amount || parseFloat(amount) <= 0) return reply.code(400).send({ error: 'Valor inválido' })

    const result = await query(
      `UPDATE savings_goals
       SET current_amount = GREATEST(0, current_amount - $1),
           completed = false
       WHERE id=$2 AND user_id=$3 AND deleted_at IS NULL RETURNING *`,
      [parseFloat(amount), request.params.id, userId]
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'Não encontrada' })
    return result.rows[0]
  })

  // Deletar meta
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    await query('UPDATE savings_goals SET deleted_at = NOW() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [request.params.id, userId])
    return { message: 'Meta removida' }
  })
}
