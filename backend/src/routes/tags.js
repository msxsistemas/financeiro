import { query } from '../db/index.js'

export default async function tagsRoutes(app) {
  // Listar tags
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const result = await query(`
      SELECT t.*, COUNT(tt.transaction_id) as usage_count
      FROM tags t
      LEFT JOIN transaction_tags tt ON tt.tag_id = t.id
      WHERE t.user_id=$1
      GROUP BY t.id
      ORDER BY usage_count DESC, t.name ASC
    `, [userId])
    return result.rows
  })

  // Criar tag
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { name, color } = request.body
    if (!name) return reply.code(400).send({ error: 'Nome é obrigatório' })
    const result = await query(
      `INSERT INTO tags (name, color, user_id) VALUES ($1,$2,$3)
       ON CONFLICT (name, user_id) DO UPDATE SET color=$2 RETURNING *`,
      [name.toLowerCase().trim(), color || '#6366f1', userId]
    )
    return reply.code(201).send(result.rows[0])
  })

  // Atualizar tag
  app.put('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { name, color } = request.body
    if (!name || !String(name).trim()) return reply.code(400).send({ error: 'Nome é obrigatório' })
    const result = await query(
      'UPDATE tags SET name=$1, color=$2 WHERE id=$3 AND user_id=$4 RETURNING *',
      [name?.toLowerCase().trim(), color || '#6366f1', request.params.id, userId]
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'Não encontrada' })
    return result.rows[0]
  })

  // Deletar tag
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    await query('DELETE FROM tags WHERE id=$1 AND user_id=$2', [request.params.id, userId])
    return { message: 'Tag removida' }
  })

  // Adicionar tags a uma transação
  app.post('/transaction/:transactionId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { tag_ids } = request.body // array de UUIDs
    if (!Array.isArray(tag_ids)) return reply.code(400).send({ error: 'tag_ids deve ser um array' })

    // Remove tags antigas
    await query('DELETE FROM transaction_tags WHERE transaction_id=$1', [request.params.transactionId])

    // Adiciona novas
    for (const tagId of tag_ids) {
      await query(
        `INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [request.params.transactionId, tagId]
      ).catch(() => {})
    }

    return { ok: true }
  })

  // Tags de uma transação
  app.get('/transaction/:transactionId', { preHandler: [app.authenticate] }, async (request) => {
    const result = await query(`
      SELECT t.* FROM tags t
      JOIN transaction_tags tt ON tt.tag_id = t.id
      WHERE tt.transaction_id=$1
    `, [request.params.transactionId])
    return result.rows
  })
}
