import { query, logActivity } from '../db/index.js'

const ENTITIES = {
  transaction: {
    table: 'transactions',
    label: 'Transação',
    fields: 'id, description as title, amount, type, deleted_at'
  },
  debt: {
    table: 'debts',
    label: 'Dívida',
    fields: 'id, description as title, amount, type, deleted_at'
  },
  contact: {
    table: 'contacts',
    label: 'Contato',
    fields: 'id, name as title, phone, type, deleted_at'
  },
  product: {
    table: 'products',
    label: 'Produto',
    fields: 'id, name as title, price, stock_quantity as quantity, deleted_at'
  },
  loan: {
    table: 'loans',
    label: 'Empréstimo',
    fields: 'id, contact_name as title, principal_amount as amount, deleted_at'
  },
  calendar_event: {
    table: 'calendar_events',
    label: 'Agendamento',
    fields: 'id, title, start_date, deleted_at'
  },
  goal: {
    table: 'savings_goals',
    label: 'Meta',
    fields: 'id, name as title, target_amount, deleted_at'
  }
}

export default async function trashRoutes(app) {
  // Listar todos os itens soft-deleted
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const results = {}
    for (const [key, e] of Object.entries(ENTITIES)) {
      try {
        const r = await query(
          `SELECT ${e.fields} FROM ${e.table}
           WHERE user_id = $1 AND deleted_at IS NOT NULL
           ORDER BY deleted_at DESC LIMIT 100`,
          [userId]
        )
        results[key] = { label: e.label, items: r.rows }
      } catch (err) {
        results[key] = { label: e.label, items: [], error: err.message }
      }
    }
    return results
  })

  // Restaurar um item (deleted_at = NULL)
  app.post('/:entity/:id/restore', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { entity, id } = request.params
    const e = ENTITIES[entity]
    if (!e) return reply.code(400).send({ error: 'Entidade inválida' })
    const r = await query(
      `UPDATE ${e.table} SET deleted_at = NULL WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL RETURNING id`,
      [id, request.user.id]
    )
    if (!r.rows[0]) return reply.code(404).send({ error: 'Item não encontrado na lixeira' })
    await logActivity(request.user.id, 'RESTORE', entity, id, `${e.label} restaurada`)
    return { ok: true }
  })

  // Deletar permanentemente
  app.delete('/:entity/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { entity, id } = request.params
    const e = ENTITIES[entity]
    if (!e) return reply.code(400).send({ error: 'Entidade inválida' })
    const r = await query(
      `DELETE FROM ${e.table} WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL RETURNING id`,
      [id, request.user.id]
    )
    if (!r.rows[0]) return reply.code(404).send({ error: 'Item não encontrado na lixeira' })
    return { ok: true }
  })

  // Esvaziar lixeira do usuário
  app.delete('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    let total = 0
    for (const e of Object.values(ENTITIES)) {
      try {
        const r = await query(
          `DELETE FROM ${e.table} WHERE user_id = $1 AND deleted_at IS NOT NULL`,
          [userId]
        )
        total += r.rowCount || 0
      } catch {}
    }
    return { deleted: total }
  })
}

// Purge de itens soft-deleted há mais de 30 dias (para rodar em cron)
export async function purgeOldTrash() {
  let total = 0
  for (const e of Object.values(ENTITIES)) {
    try {
      const r = await query(
        `DELETE FROM ${e.table} WHERE deleted_at < NOW() - INTERVAL '30 days'`
      )
      total += r.rowCount || 0
    } catch {}
  }
  return total
}
