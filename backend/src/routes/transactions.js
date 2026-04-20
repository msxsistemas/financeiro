import { query, logActivity } from '../db/index.js'
import XLSX from 'xlsx'
import { invalidateDashboardCache } from './dashboard.js'

// Schemas de validação Fastify
const createTransactionSchema = {
  body: {
    type: 'object',
    required: ['description', 'amount', 'type'],
    properties: {
      description: { type: 'string', minLength: 1, maxLength: 500 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      type: { type: 'string', enum: ['income', 'expense'] },
      status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
      category_id: { type: ['string', 'null'] },
      due_date: { type: ['string', 'null'], format: 'date' },
      paid_date: { type: ['string', 'null'], format: 'date' },
      notes: { type: ['string', 'null'], maxLength: 2000 },
      is_recurring: { type: 'boolean' },
      recurrence_type: { type: ['string', 'null'], enum: ['daily', 'weekly', 'monthly', 'yearly', null] },
      product_id: { type: ['string', 'null'] },
      product_quantity: { type: ['integer', 'null'], minimum: 0 },
      account_id: { type: ['string', 'null'] },
      cost_center: { type: ['string', 'null'], maxLength: 100 },
      project: { type: ['string', 'null'], maxLength: 100 }
    }
  }
}

const updateTransactionSchema = {
  body: {
    type: 'object',
    properties: {
      description: { type: 'string', minLength: 1, maxLength: 500 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      type: { type: 'string', enum: ['income', 'expense'] },
      status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
      category_id: { type: ['string', 'null'] },
      due_date: { type: ['string', 'null'] },
      paid_date: { type: ['string', 'null'] },
      notes: { type: ['string', 'null'], maxLength: 2000 },
      account_id: { type: ['string', 'null'] },
      cost_center: { type: ['string', 'null'], maxLength: 100 },
      project: { type: ['string', 'null'], maxLength: 100 }
    }
  }
}

const idParamSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } }
  }
}

export default async function transactionsRoutes(app) {
  // Listar
  app.get('/', {
    preHandler: [app.authenticate]
  }, async (request) => {
    const userId = request.user.id
    const { type, status, category_id, account_id, start_date, end_date, page = 1, limit = 20, search, cost_center } = request.query

    const conditions = ['t.user_id = $1', 't.deleted_at IS NULL']
    const params = [userId]
    let idx = 2

    if (type) { conditions.push(`t.type = $${idx++}`); params.push(type) }
    if (status) { conditions.push(`t.status = $${idx++}`); params.push(status) }
    if (category_id) { conditions.push(`t.category_id = $${idx++}`); params.push(category_id) }
    if (account_id) { conditions.push(`t.account_id = $${idx++}`); params.push(account_id) }
    if (start_date) { conditions.push(`t.due_date >= $${idx++}`); params.push(start_date) }
    if (end_date) { conditions.push(`t.due_date <= $${idx++}`); params.push(end_date) }
    if (search) { conditions.push(`t.description ILIKE $${idx++}`); params.push(`%${search}%`) }
    if (cost_center) { conditions.push(`t.cost_center ILIKE $${idx++}`); params.push(`%${cost_center}%`) }

    const safePage = Math.max(1, parseInt(page) || 1)
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20))
    const offset = (safePage - 1) * safeLimit
    const where = conditions.join(' AND ')

    const countRes = await query(`SELECT COUNT(*) FROM transactions t WHERE ${where}`, params)
    const total = parseInt(countRes.rows[0].count)

    const result = await query(`
      SELECT t.*, c.name as category_name, c.color as category_color,
        a.name as account_name, a.icon as account_icon
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE ${where}
      ORDER BY t.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, safeLimit, offset])

    return {
      data: result.rows,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit)
    }
  })

  // Buscar por ID
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await query(
      'SELECT t.*, c.name as category_name FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id = $1 AND t.user_id = $2 AND t.deleted_at IS NULL',
      [request.params.id, request.user.id]
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })
    return result.rows[0]
  })

  // Criar
  app.post('/', { schema: createTransactionSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { description, amount, type, status, category_id, due_date, paid_date, notes,
            is_recurring, recurrence_type, product_id, product_quantity, account_id,
            cost_center, project } = request.body

    if (!description || !amount || !type) {
      return reply.code(400).send({ error: 'Descrição, valor e tipo são obrigatórios' })
    }

    // Detecção de duplicatas (mesma descrição, valor, tipo e data nos últimos 5 minutos)
    const duplicateCheck = await query(`
      SELECT id FROM transactions
      WHERE user_id = $1 AND description = $2 AND amount = $3 AND type = $4
        AND created_at > NOW() - INTERVAL '5 minutes'
        AND deleted_at IS NULL
      LIMIT 1
    `, [userId, description, amount, type])
    if (duplicateCheck.rows[0]) {
      return reply.code(409).send({
        error: 'Possível duplicata detectada. Uma transação idêntica foi criada há menos de 5 minutos.',
        duplicate_id: duplicateCheck.rows[0].id
      })
    }

    // Calcular próxima data de recorrência (a original já conta como 1ª ocorrência,
    // o cron cria as seguintes a partir de next_date)
    let recurrence_next_date = null
    if (is_recurring && recurrence_type && due_date) {
      const parts = String(due_date).substring(0, 10).split('-')
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0)
      const targetDay = d.getDate()
      switch (recurrence_type) {
        case 'daily': d.setDate(d.getDate() + 1); break
        case 'weekly': d.setDate(d.getDate() + 7); break
        case 'monthly': {
          d.setDate(1); d.setMonth(d.getMonth() + 1)
          const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
          d.setDate(Math.min(targetDay, lastDay))
          break
        }
        case 'yearly': d.setFullYear(d.getFullYear() + 1); break
      }
      const pad2 = n => String(n).padStart(2, '0')
      recurrence_next_date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    }

    const result = await query(`
      INSERT INTO transactions (description, amount, type, status, category_id, due_date, paid_date, notes, user_id,
        is_recurring, recurrence_type, recurrence_next_date, product_id, product_quantity, account_id, cost_center, project)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [description, amount, type, status || 'pending', category_id || null, due_date || null,
        paid_date || null, notes || null, userId,
        is_recurring || false, recurrence_type || null, recurrence_next_date,
        product_id || null, product_quantity || null, account_id || null,
        cost_center || null, project || null])

    const tx = result.rows[0]

    // Dar saída no estoque se for venda vinculada a produto
    if (product_id && product_quantity && type === 'income') {
      const prod = await query('SELECT * FROM products WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [product_id, userId])
      if (prod.rows[0]) {
        const newQty = prod.rows[0].stock_quantity - parseInt(product_quantity)
        await query('UPDATE products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL',
          [Math.max(0, newQty), product_id])
        await query(
          'INSERT INTO stock_movements (product_id, type, quantity, reason, user_id) VALUES ($1, $2, $3, $4, $5)',
          [product_id, 'out', product_quantity, `Venda: ${description}`, userId]
        )
      }
    }

    await logActivity(userId, 'CREATE', 'transaction', tx.id,
      `${type === 'income' ? 'Receita' : 'Despesa'} criada: ${description} - R$ ${amount}`)
    invalidateDashboardCache(userId)

    return reply.code(201).send(tx)
  })

  // Atualizar
  app.put('/:id', { schema: { ...updateTransactionSchema, ...idParamSchema }, preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { description, amount, type, status, category_id, due_date, paid_date, notes, account_id, cost_center, project } = request.body

    const check = await query('SELECT id FROM transactions WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    if (!check.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })

    const result = await query(`
      UPDATE transactions SET
        description = $1, amount = $2, type = $3, status = $4,
        category_id = $5, due_date = $6, paid_date = $7, notes = $8,
        account_id = $9, cost_center = $10, project = $11, updated_at = NOW()
      WHERE id = $12 AND user_id = $13 AND deleted_at IS NULL
      RETURNING *
    `, [description, amount, type, status, category_id || null, due_date || null, paid_date || null, notes || null, account_id || null, cost_center || null, project || null, request.params.id, userId])

    await logActivity(userId, 'UPDATE', 'transaction', request.params.id, `Transação atualizada: ${description}`)
    invalidateDashboardCache(userId)

    return result.rows[0]
  })

  // Deletar
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const check = await query('SELECT id FROM transactions WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    if (!check.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })

    await query('UPDATE transactions SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    await logActivity(userId, 'DELETE', 'transaction', request.params.id, 'Transação removida')
    invalidateDashboardCache(userId)

    return { message: 'Removido com sucesso' }
  })

  // Categorias
  app.get('/categories/list', { preHandler: [app.authenticate] }, async (request) => {
    const result = await query(
      'SELECT * FROM categories WHERE user_id = $1 ORDER BY type, name',
      [request.user.id]
    )
    return result.rows
  })

  app.post('/categories', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { name, type, color } = request.body
    if (!name || !type) return reply.code(400).send({ error: 'Nome e tipo são obrigatórios' })

    const result = await query(
      'INSERT INTO categories (name, type, color, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, type, color || '#6366f1', request.user.id]
    )
    return reply.code(201).send(result.rows[0])
  })

  app.put('/categories/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { name, type, color } = request.body
    if (!name || !type) return reply.code(400).send({ error: 'Nome e tipo são obrigatórios' })
    const result = await query(
      'UPDATE categories SET name = $1, type = $2, color = $3 WHERE id = $4 AND user_id = $5 RETURNING *',
      [name, type, color || '#6366f1', request.params.id, request.user.id]
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'Categoria não encontrada' })
    return result.rows[0]
  })

  app.delete('/categories/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    await query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [request.params.id, request.user.id])
    return { message: 'Removido' }
  })

  // Import CSV (recebe array JSON parseado no frontend)
  app.post('/import', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { rows } = request.body

    if (!Array.isArray(rows) || rows.length === 0) {
      return reply.code(400).send({ error: 'Nenhum dado para importar' })
    }

    let imported = 0
    const errors = []

    for (const row of rows.slice(0, 500)) {
      try {
        const { description, amount, type, status, category_id, due_date, paid_date, notes } = row
        if (!description || !amount || !type) {
          errors.push(`Linha inválida: ${JSON.stringify(row)}`)
          continue
        }
        const parsedAmount = parseFloat(String(amount).replace(',', '.'))
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          errors.push(`Valor inválido em: ${description}`)
          continue
        }
        const validType = ['income', 'expense'].includes(type) ? type : null
        if (!validType) {
          errors.push(`Tipo inválido em: ${description}`)
          continue
        }
        await query(`
          INSERT INTO transactions (description, amount, type, status, category_id, due_date, paid_date, notes, user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          description, parsedAmount, validType,
          ['pending', 'completed', 'cancelled'].includes(status) ? status : 'pending',
          category_id || null,
          due_date || null,
          paid_date || null,
          notes || null,
          userId
        ])
        imported++
      } catch (err) {
        errors.push(`Erro ao importar linha: ${err.message}`)
      }
    }

    await logActivity(userId, 'IMPORT', 'transaction', null, `${imported} transações importadas via CSV`)
    return { imported, errors: errors.slice(0, 20), total_rows: rows.length }
  })

  // Export CSV
  app.get('/export/csv', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { type, status, start_date, end_date } = request.query

    const conditions = ['t.user_id = $1', 't.deleted_at IS NULL']
    const params = [userId]
    let idx = 2

    if (type) { conditions.push(`t.type = $${idx++}`); params.push(type) }
    if (status) { conditions.push(`t.status = $${idx++}`); params.push(status) }
    if (start_date) { conditions.push(`t.due_date >= $${idx++}`); params.push(start_date) }
    if (end_date) { conditions.push(`t.due_date <= $${idx++}`); params.push(end_date) }

    const result = await query(`
      SELECT t.description, t.type, t.amount, t.status, c.name as category,
        t.due_date, t.paid_date, t.notes, t.created_at
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.created_at DESC
    `, params)

    const header = 'Descricao,Tipo,Valor,Status,Categoria,Vencimento,Pagamento,Observacoes,Criado em\n'
    const rows = result.rows.map(r =>
      `"${r.description}","${r.type === 'income' ? 'Receita' : 'Despesa'}","${parseFloat(r.amount).toFixed(2)}","${r.status}","${r.category || ''}","${r.due_date ? new Date(r.due_date).toLocaleDateString('pt-BR') : ''}","${r.paid_date ? new Date(r.paid_date).toLocaleDateString('pt-BR') : ''}","${r.notes || ''}","${new Date(r.created_at).toLocaleDateString('pt-BR')}"`
    ).join('\n')

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="transacoes_${new Date().toISOString().split('T')[0]}.csv"`)
    return reply.send('\uFEFF' + header + rows)
  })

  // Export XLSX
  app.get('/export/xlsx', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { type, status, start_date, end_date } = request.query

    const conditions = ['t.user_id = $1', 't.deleted_at IS NULL']
    const params = [userId]
    let idx = 2

    if (type) { conditions.push(`t.type = $${idx++}`); params.push(type) }
    if (status) { conditions.push(`t.status = $${idx++}`); params.push(status) }
    if (start_date) { conditions.push(`t.due_date >= $${idx++}`); params.push(start_date) }
    if (end_date) { conditions.push(`t.due_date <= $${idx++}`); params.push(end_date) }

    const result = await query(`
      SELECT t.description, t.type, t.amount, t.status, c.name as category,
        t.due_date, t.paid_date, t.notes, t.created_at
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.created_at DESC
    `, params)

    const wsData = [
      ['Descrição', 'Tipo', 'Valor (R$)', 'Status', 'Categoria', 'Vencimento', 'Pagamento', 'Observações', 'Criado em'],
      ...result.rows.map(r => [
        r.description,
        r.type === 'income' ? 'Receita' : 'Despesa',
        parseFloat(r.amount),
        r.status,
        r.category || '',
        r.due_date ? new Date(r.due_date).toLocaleDateString('pt-BR') : '',
        r.paid_date ? new Date(r.paid_date).toLocaleDateString('pt-BR') : '',
        r.notes || '',
        new Date(r.created_at).toLocaleDateString('pt-BR')
      ])
    ]

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [{ wch: 35 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Transações')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename="transacoes_${new Date().toISOString().split('T')[0]}.xlsx"`)
    return reply.send(buffer)
  })
}
