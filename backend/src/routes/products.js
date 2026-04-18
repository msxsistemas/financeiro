import { query, logActivity } from '../db/index.js'

export default async function productsRoutes(app) {
  // Listar produtos
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const { search, category, low_stock, active, page = 1, limit = 50 } = request.query

    const conditions = ['user_id = $1']
    const params = [userId]
    let idx = 2

    if (active === 'true') { conditions.push(`active = TRUE`) }
    else if (active === 'false') { conditions.push(`active = FALSE`) }

    if (search) {
      conditions.push(`(name ILIKE $${idx} OR sku ILIKE $${idx})`)
      params.push(`%${search}%`)
      idx++
    }
    if (category) { conditions.push(`category = $${idx++}`); params.push(category) }
    if (low_stock === 'true') { conditions.push(`stock_quantity <= min_stock`) }

    const safePage = Math.max(1, parseInt(page) || 1)
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit) || 50))
    const offset = (safePage - 1) * safeLimit
    const where = conditions.join(' AND ')

    const countRes = await query(`SELECT COUNT(*) FROM products WHERE ${where}`, params)
    const total = parseInt(countRes.rows[0].count)

    const result = await query(
      `SELECT * FROM products WHERE ${where} ORDER BY name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, safeLimit, offset]
    )

    return {
      data: result.rows,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit)
    }
  })

  // Detalhe + movimentos
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.id
    const prod = await query('SELECT * FROM products WHERE id = $1 AND user_id = $2', [id, userId])
    if (!prod.rows[0]) return reply.code(404).send({ error: 'Produto não encontrado' })
    const movs = await query(
      `SELECT * FROM stock_movements WHERE product_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 50`,
      [id, userId]
    )
    return { ...prod.rows[0], movements: movs.rows }
  })

  // Criar
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { name, description, sku, price, cost, stock_quantity, min_stock, unit, category } = request.body
    if (!name) return reply.code(400).send({ error: 'Nome obrigatório' })

    const result = await query(`
      INSERT INTO products (name, description, sku, price, cost, stock_quantity, min_stock, unit, category, user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [
      name, description || null, sku || null,
      parseFloat(price) || 0, parseFloat(cost) || 0,
      parseInt(stock_quantity) || 0, parseInt(min_stock) || 0,
      unit || 'un', category || null, userId
    ])

    await logActivity(userId, 'PRODUCT_CREATE', 'product', result.rows[0].id, `Produto criado: ${name}`)
    return reply.code(201).send(result.rows[0])
  })

  // Atualizar
  app.put('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.id
    const { name, description, sku, price, cost, min_stock, unit, category, active } = request.body
    const result = await query(`
      UPDATE products SET
        name = COALESCE($1, name),
        description = $2,
        sku = $3,
        price = COALESCE($4, price),
        cost = COALESCE($5, cost),
        min_stock = COALESCE($6, min_stock),
        unit = COALESCE($7, unit),
        category = $8,
        active = COALESCE($9, active),
        updated_at = NOW()
      WHERE id = $10 AND user_id = $11
      RETURNING *
    `, [
      name || null, description || null, sku || null,
      price != null ? parseFloat(price) : null,
      cost != null ? parseFloat(cost) : null,
      min_stock != null ? parseInt(min_stock) : null,
      unit || null, category || null,
      typeof active === 'boolean' ? active : null,
      id, userId
    ])
    if (!result.rows[0]) return reply.code(404).send({ error: 'Produto não encontrado' })
    await logActivity(userId, 'PRODUCT_UPDATE', 'product', id, `Produto atualizado: ${result.rows[0].name}`)
    return result.rows[0]
  })

  // Remover
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.id
    const res = await query('DELETE FROM products WHERE id = $1 AND user_id = $2 RETURNING name', [id, userId])
    if (!res.rows[0]) return reply.code(404).send({ error: 'Produto não encontrado' })
    await logActivity(userId, 'PRODUCT_DELETE', 'product', id, `Produto removido: ${res.rows[0].name}`)
    return { ok: true }
  })

  // Movimentar estoque (entrada, saída, ajuste)
  app.post('/:id/stock', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.id
    const { type, quantity, reason, reference } = request.body

    if (!['in', 'out', 'adjustment'].includes(type)) {
      return reply.code(400).send({ error: 'Tipo inválido (use in, out ou adjustment)' })
    }
    const qty = parseInt(quantity)
    if (!isFinite(qty) || qty === 0) {
      return reply.code(400).send({ error: 'Quantidade inválida' })
    }

    const prodRes = await query('SELECT * FROM products WHERE id = $1 AND user_id = $2', [id, userId])
    if (!prodRes.rows[0]) return reply.code(404).send({ error: 'Produto não encontrado' })
    const prod = prodRes.rows[0]

    let newQty = prod.stock_quantity
    if (type === 'in') newQty += Math.abs(qty)
    else if (type === 'out') newQty -= Math.abs(qty)
    else newQty = Math.abs(qty) // adjustment define o valor absoluto

    if (newQty < 0) return reply.code(400).send({ error: 'Estoque não pode ficar negativo' })

    await query('UPDATE products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2', [newQty, id])
    const mov = await query(`
      INSERT INTO stock_movements (product_id, type, quantity, reason, reference, user_id)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [id, type, Math.abs(qty), reason || null, reference || null, userId])

    await logActivity(userId, 'STOCK_MOVEMENT', 'product', id,
      `${type === 'in' ? 'Entrada' : type === 'out' ? 'Saída' : 'Ajuste'} de ${Math.abs(qty)} em ${prod.name}`)

    return { ...prod, stock_quantity: newQty, movement: mov.rows[0] }
  })

  // Categorias distintas
  app.get('/categories/list', { preHandler: [app.authenticate] }, async (request) => {
    const res = await query(
      `SELECT DISTINCT category FROM products WHERE user_id = $1 AND category IS NOT NULL ORDER BY category ASC`,
      [request.user.id]
    )
    return res.rows.map(r => r.category)
  })
}
