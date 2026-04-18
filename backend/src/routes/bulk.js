import { query, logActivity } from '../db/index.js'

export default async function bulkRoutes(app) {

  // Bulk delete transacoes
  app.post('/transactions/delete', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { ids } = request.body
    if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: 'ids obrigatorio (array)' })
    if (ids.length > 100) return reply.code(400).send({ error: 'Maximo 100 itens por vez' })

    const result = await query(
      'DELETE FROM transactions WHERE id = ANY($1) AND user_id = $2 RETURNING id',
      [ids, userId]
    )
    await logActivity(userId, 'BULK_DELETE', 'transaction', null, `${result.rowCount} transacoes removidas em lote`)
    return { deleted: result.rowCount, ids: result.rows.map(r => r.id) }
  })

  // Bulk update status transacoes
  app.post('/transactions/status', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { ids, status } = request.body
    if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: 'ids obrigatorio' })
    if (!['pending', 'completed', 'cancelled'].includes(status)) return reply.code(400).send({ error: 'Status invalido' })
    if (ids.length > 100) return reply.code(400).send({ error: 'Maximo 100 itens por vez' })

    const extra = status === 'completed' ? ', paid_date = CURRENT_DATE' : ''
    const result = await query(
      `UPDATE transactions SET status = $1${extra}, updated_at = NOW() WHERE id = ANY($2) AND user_id = $3 RETURNING id`,
      [status, ids, userId]
    )
    await logActivity(userId, 'BULK_UPDATE', 'transaction', null, `${result.rowCount} transacoes atualizadas para ${status}`)
    return { updated: result.rowCount }
  })

  // Bulk delete dividas
  app.post('/debts/delete', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { ids } = request.body
    if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: 'ids obrigatorio' })
    if (ids.length > 100) return reply.code(400).send({ error: 'Maximo 100 itens por vez' })

    const result = await query(
      'DELETE FROM debts WHERE id = ANY($1) AND user_id = $2 RETURNING id',
      [ids, userId]
    )
    await logActivity(userId, 'BULK_DELETE', 'debt', null, `${result.rowCount} dividas removidas em lote`)
    return { deleted: result.rowCount }
  })

  // Bulk update status dividas
  app.post('/debts/status', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { ids, status } = request.body
    if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: 'ids obrigatorio' })
    if (!['pending', 'paid', 'overdue', 'partial'].includes(status)) return reply.code(400).send({ error: 'Status invalido' })
    if (ids.length > 100) return reply.code(400).send({ error: 'Maximo 100 itens por vez' })

    const result = await query(
      'UPDATE debts SET status = $1, updated_at = NOW() WHERE id = ANY($2) AND user_id = $3 RETURNING id',
      [status, ids, userId]
    )
    await logActivity(userId, 'BULK_UPDATE', 'debt', null, `${result.rowCount} dividas atualizadas para ${status}`)
    return { updated: result.rowCount }
  })
}
