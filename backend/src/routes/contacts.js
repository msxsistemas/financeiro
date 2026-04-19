import { query, logActivity } from '../db/index.js'

export default async function contactsRoutes(app) {
  // Listar contatos
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const { type, search, page = 1, limit = 50 } = request.query

    const conditions = ['user_id = $1', 'deleted_at IS NULL']
    const params = [userId]
    let idx = 2

    if (type) { conditions.push(`type = $${idx++}`); params.push(type) }
    if (search) {
      conditions.push(`(name ILIKE $${idx} OR phone ILIKE $${idx} OR email ILIKE $${idx} OR cpf_cnpj ILIKE $${idx})`)
      params.push(`%${search}%`)
      idx++
    }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const where = conditions.join(' AND ')

    const countRes = await query(`SELECT COUNT(*) FROM contacts WHERE ${where}`, params)
    const result = await query(`
      SELECT * FROM contacts WHERE ${where}
      ORDER BY name ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, parseInt(limit), offset])

    return {
      data: result.rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit))
    }
  })

  // Buscar por ID
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await query(
      'SELECT * FROM contacts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [request.params.id, request.user.id]
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })
    return result.rows[0]
  })

  // Criar contato
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { name, phone, email, cpf_cnpj, type, notes, address, city, state, zip_code } = request.body

    if (!name) return reply.code(400).send({ error: 'Nome é obrigatório' })

    const result = await query(`
      INSERT INTO contacts (name, phone, email, cpf_cnpj, type, notes, address, city, state, zip_code, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [name, phone || null, email || null, cpf_cnpj || null,
        type || 'client', notes || null, address || null, city || null, state || null, zip_code || null, userId])

    await logActivity(userId, 'CREATE', 'contact', result.rows[0].id, `Contato criado: ${name}`)
    return reply.code(201).send(result.rows[0])
  })

  // Atualizar
  app.put('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { name, phone, email, cpf_cnpj, type, notes, address, city, state, zip_code } = request.body

    const check = await query('SELECT id FROM contacts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    if (!check.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })

    const result = await query(`
      UPDATE contacts SET
        name = $1, phone = $2, email = $3, cpf_cnpj = $4,
        type = $5, notes = $6, address = $7, city = $8, state = $9, zip_code = $10, updated_at = NOW()
      WHERE id = $11 AND user_id = $12 AND deleted_at IS NULL
      RETURNING *
    `, [name, phone || null, email || null, cpf_cnpj || null,
        type || 'client', notes || null, address || null, city || null, state || null, zip_code || null, request.params.id, userId])

    await logActivity(userId, 'UPDATE', 'contact', request.params.id, `Contato atualizado: ${name}`)
    return result.rows[0]
  })

  // Histórico financeiro do contato
  app.get('/:id/history', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const contactRes = await query('SELECT * FROM contacts WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [request.params.id, userId])
    if (!contactRes.rows[0]) return { contact: null, debts: [], transactions: [], sales: [] }
    const contact = contactRes.rows[0]

    const [debtsRes, transRes, salesRes] = await Promise.all([
      query(`SELECT * FROM debts WHERE user_id=$1 AND (contact_name ILIKE $2 OR contact_phone=$3) AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`,
        [userId, `%${contact.name}%`, contact.phone || '']),
      query(`SELECT * FROM transactions WHERE user_id=$1 AND description ILIKE $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 30`,
        [userId, `%${contact.name}%`]),
      query(`SELECT sm.*, p.name as product_name FROM stock_movements sm
        JOIN products p ON p.id = sm.product_id
        WHERE sm.user_id=$1 AND sm.type='out' AND sm.reason ILIKE $2 ORDER BY sm.created_at DESC LIMIT 30`,
        [userId, `%${contact.name}%`]).catch(() => ({ rows: [] }))
    ])

    const totalReceivable = debtsRes.rows.filter(d => d.type === 'receivable').reduce((s, d) => s + parseFloat(d.amount), 0)
    const totalPayable    = debtsRes.rows.filter(d => d.type === 'payable').reduce((s, d) => s + parseFloat(d.amount), 0)

    return {
      contact,
      debts: debtsRes.rows,
      transactions: transRes.rows,
      sales: salesRes.rows,
      summary: { total_receivable: totalReceivable, total_payable: totalPayable }
    }
  })

  // Importar CSV
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
        const name = row.name || row.nome || row.Name
        if (!name) { errors.push(`Linha sem nome: ${JSON.stringify(row)}`); continue }
        const phone = row.phone || row.telefone || row.celular || null
        const email = row.email || row.Email || null
        const type = (['client', 'supplier'].includes(row.type) ? row.type :
          (row.tipo === 'fornecedor' ? 'supplier' : 'client'))
        const ins = await query(`
          INSERT INTO contacts (name, phone, email, cpf_cnpj, type, notes, user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT DO NOTHING
          RETURNING id
        `, [name, phone, email, row.cpf_cnpj || row.cpf || row.cnpj || null, type, row.notes || row.observacoes || null, userId])
        if (ins.rows[0]) imported++
      } catch (err) {
        errors.push(`Erro: ${err.message}`)
      }
    }

    await logActivity(userId, 'IMPORT', 'contact', null, `${imported} contatos importados via CSV`)
    return { imported, errors: errors.slice(0, 20), total_rows: rows.length }
  })

  // Deletar
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const check = await query('SELECT id FROM contacts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    if (!check.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })

    await query('UPDATE contacts SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    await logActivity(userId, 'DELETE', 'contact', request.params.id, 'Contato removido')
    return { message: 'Removido com sucesso' }
  })
}
