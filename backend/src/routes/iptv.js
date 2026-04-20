import { query, logActivity } from '../db/index.js'

export default async function iptvRoutes(app) {

  // ── INIT TABLES ──────────────────────────────────────────────
  app.addHook('onReady', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS iptv_servers (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        name VARCHAR(100) NOT NULL,
        max_clients INTEGER DEFAULT 0,
        credit_value NUMERIC(10,2) DEFAULT 0,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await query(`ALTER TABLE iptv_servers ADD COLUMN IF NOT EXISTS max_clients INTEGER DEFAULT 0`).catch(() => {})
    await query(`ALTER TABLE iptv_servers ADD COLUMN IF NOT EXISTS credit_value NUMERIC(10,2) DEFAULT 0`).catch(() => {})
    await query(`
      CREATE TABLE IF NOT EXISTS iptv_resellers (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        server_id INTEGER REFERENCES iptv_servers(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(30),
        credit_quantity INTEGER DEFAULT 0,
        credit_sell_value NUMERIC(10,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await query(`
      CREATE TABLE IF NOT EXISTS iptv_my_clients (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        server_id INTEGER REFERENCES iptv_servers(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(30),
        credit_quantity INTEGER DEFAULT 1,
        sell_value NUMERIC(10,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    // Colunas adicionadas tardiamente ou que podem faltar em DBs antigos
    await query(`ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS phone VARCHAR(30)`).catch(() => {})
    await query(`ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS credit_quantity INTEGER DEFAULT 1`).catch(() => {})
    await query(`ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS sell_value NUMERIC(10,2) DEFAULT 0`).catch(() => {})
    await query(`ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'`).catch(() => {})
    await query(`ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS notes TEXT`).catch(() => {})
    await query(`ALTER TABLE iptv_resellers ADD COLUMN IF NOT EXISTS phone VARCHAR(30)`).catch(() => {})
    await query(`ALTER TABLE iptv_resellers ADD COLUMN IF NOT EXISTS credit_quantity INTEGER DEFAULT 0`).catch(() => {})
    await query(`ALTER TABLE iptv_resellers ADD COLUMN IF NOT EXISTS credit_sell_value NUMERIC(10,2) DEFAULT 0`).catch(() => {})
    await query(`ALTER TABLE iptv_resellers ADD COLUMN IF NOT EXISTS notes TEXT`).catch(() => {})
  })

  // ══════════════════════════════════════════════════════════════
  // SERVIDORES & APPS
  // ══════════════════════════════════════════════════════════════

  app.get('/servers', { preHandler: [app.authenticate] }, async (req) => {
    const res = await query(`
      SELECT s.*,
        COALESCE((SELECT SUM(r.credit_quantity) FROM iptv_resellers r WHERE r.server_id = s.id), 0) AS credits_sold,
        COALESCE((SELECT SUM(r.credit_quantity * r.credit_sell_value) FROM iptv_resellers r WHERE r.server_id = s.id), 0) AS reseller_revenue,
        COALESCE((SELECT SUM(mc.credit_quantity) FROM iptv_my_clients mc WHERE mc.server_id = s.id AND mc.status = 'active'), 0) AS my_clients_count,
        COALESCE((SELECT SUM(mc.credit_quantity * mc.sell_value) FROM iptv_my_clients mc WHERE mc.server_id = s.id AND mc.status = 'active'), 0) AS my_clients_revenue
      FROM iptv_servers s WHERE s.user_id = $1 ORDER BY s.name
    `, [req.user.id])
    return res.rows.map(s => {
      const creditValue = parseFloat(s.credit_value)
      const creditsSold = parseInt(s.credits_sold)
      const resellerRev = parseFloat(s.reseller_revenue)
      // Faturamento/Lucro por servidor consideram apenas revendedores.
      // Meus Servidores (my_clients) é apenas contador operacional.
      return {
        ...s,
        max_clients: parseInt(s.max_clients),
        credit_value: creditValue,
        credits_sold: creditsSold,
        reseller_revenue: resellerRev,
        my_clients_count: parseInt(s.my_clients_count),
        my_clients_revenue: parseFloat(s.my_clients_revenue),
        total_revenue: resellerRev,
        total_cost: creditValue * creditsSold,
        profit: resellerRev - (creditValue * creditsSold)
      }
    })
  })

  app.post('/servers', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { name, max_clients, credit_value } = req.body
    if (!name) return reply.code(400).send({ error: 'Nome e obrigatorio' })
    const res = await query(
      `INSERT INTO iptv_servers (user_id, name, max_clients, credit_value) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, name, max_clients || 0, credit_value || 0]
    )
    await logActivity(req.user.id, 'CREATE', 'iptv_server', res.rows[0].id, `Servidor IPTV: ${name}`)
    return reply.code(201).send(res.rows[0])
  })

  app.put('/servers/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { name, max_clients, credit_value, active } = req.body
    const res = await query(
      `UPDATE iptv_servers SET name=$1, max_clients=$2, credit_value=$3, active=$4 WHERE id=$5 AND user_id=$6 RETURNING *`,
      [name, max_clients || 0, credit_value || 0, active ?? true, req.params.id, req.user.id]
    )
    if (!res.rows[0]) return reply.code(404).send({ error: 'Nao encontrado' })
    return res.rows[0]
  })

  app.delete('/servers/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const res = await query(`DELETE FROM iptv_servers WHERE id=$1 AND user_id=$2 RETURNING name`, [req.params.id, req.user.id])
    if (!res.rows[0]) return reply.code(404).send({ error: 'Nao encontrado' })
    return { ok: true }
  })

  // ══════════════════════════════════════════════════════════════
  // REVENDEDORES
  // ══════════════════════════════════════════════════════════════

  app.get('/resellers', { preHandler: [app.authenticate] }, async (req) => {
    const { server_id } = req.query
    let where = 'r.user_id = $1'
    const params = [req.user.id]
    if (server_id) { params.push(server_id); where += ` AND r.server_id = $${params.length}` }
    const res = await query(`
      SELECT r.*, s.name AS server_name, s.credit_value AS server_credit_value
      FROM iptv_resellers r LEFT JOIN iptv_servers s ON s.id = r.server_id
      WHERE ${where} ORDER BY r.name
    `, params)
    return res.rows.map(r => ({
      ...r,
      credit_quantity: parseInt(r.credit_quantity),
      credit_sell_value: parseFloat(r.credit_sell_value),
      server_credit_value: parseFloat(r.server_credit_value || 0),
      total_revenue: parseInt(r.credit_quantity) * parseFloat(r.credit_sell_value),
      total_cost: parseInt(r.credit_quantity) * parseFloat(r.server_credit_value || 0),
      profit: (parseInt(r.credit_quantity) * parseFloat(r.credit_sell_value)) - (parseInt(r.credit_quantity) * parseFloat(r.server_credit_value || 0))
    }))
  })

  app.post('/resellers', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { server_id, name, phone, credit_quantity, credit_sell_value, notes } = req.body
      const sid = parseInt(server_id)
      if (!name || !sid) return reply.code(400).send({ error: 'Nome e servidor são obrigatórios' })

      const srv = await query('SELECT id FROM iptv_servers WHERE id = $1 AND user_id = $2', [sid, req.user.id])
      if (!srv.rows[0]) return reply.code(400).send({ error: 'Servidor não encontrado' })

      const res = await query(
        `INSERT INTO iptv_resellers (user_id, server_id, name, phone, credit_quantity, credit_sell_value, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.user.id, sid, name, phone || null, parseInt(credit_quantity) || 0, parseFloat(credit_sell_value) || 0, notes || null]
      )
      return reply.code(201).send(res.rows[0])
    } catch (err) {
      req.log.error({ err: err.message }, 'POST /resellers falhou')
      return reply.code(500).send({ error: err.message || 'Erro ao salvar' })
    }
  })

  app.put('/resellers/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { server_id, name, phone, credit_quantity, credit_sell_value, notes } = req.body
      const sid = parseInt(server_id)
      if (!name || !sid) return reply.code(400).send({ error: 'Nome e servidor são obrigatórios' })

      const res = await query(
        `UPDATE iptv_resellers SET server_id=$1, name=$2, phone=$3, credit_quantity=$4, credit_sell_value=$5, notes=$6, updated_at=NOW()
         WHERE id=$7 AND user_id=$8 RETURNING *`,
        [sid, name, phone || null, parseInt(credit_quantity) || 0, parseFloat(credit_sell_value) || 0, notes || null, req.params.id, req.user.id]
      )
      if (!res.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })
      return res.rows[0]
    } catch (err) {
      req.log.error({ err: err.message }, 'PUT /resellers falhou')
      return reply.code(500).send({ error: err.message || 'Erro ao salvar' })
    }
  })

  app.delete('/resellers/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const res = await query(`DELETE FROM iptv_resellers WHERE id=$1 AND user_id=$2 RETURNING name`, [req.params.id, req.user.id])
    if (!res.rows[0]) return reply.code(404).send({ error: 'Nao encontrado' })
    return { ok: true }
  })

  // ══════════════════════════════════════════════════════════════
  // MEUS CLIENTES (venda direta)
  // ══════════════════════════════════════════════════════════════

  app.get('/my-clients', { preHandler: [app.authenticate] }, async (req) => {
    const { server_id } = req.query
    let where = 'mc.user_id = $1'
    const params = [req.user.id]
    if (server_id) { params.push(server_id); where += ` AND mc.server_id = $${params.length}` }
    const res = await query(`
      SELECT mc.*, s.name AS server_name, s.credit_value AS server_credit_value
      FROM iptv_my_clients mc LEFT JOIN iptv_servers s ON s.id = mc.server_id
      WHERE ${where} ORDER BY mc.name
    `, params)
    return res.rows.map(c => ({
      ...c,
      sell_value: parseFloat(c.sell_value),
      server_credit_value: parseFloat(c.server_credit_value || 0),
      profit: parseFloat(c.sell_value) - parseFloat(c.server_credit_value || 0)
    }))
  })

  app.post('/my-clients', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { server_id, name, phone, credit_quantity, sell_value, notes } = req.body
      const sid = parseInt(server_id)
      if (!name || !sid) return reply.code(400).send({ error: 'Nome e servidor são obrigatórios' })

      // Garante que o servidor existe e pertence ao usuário (evita FK error)
      const srv = await query('SELECT id FROM iptv_servers WHERE id = $1 AND user_id = $2', [sid, req.user.id])
      if (!srv.rows[0]) return reply.code(400).send({ error: 'Servidor não encontrado' })

      const res = await query(
        `INSERT INTO iptv_my_clients (user_id, server_id, name, phone, credit_quantity, sell_value, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.user.id, sid, name, phone || null, parseInt(credit_quantity) || 1, parseFloat(sell_value) || 0, notes || null]
      )
      return reply.code(201).send(res.rows[0])
    } catch (err) {
      req.log.error({ err: err.message }, 'POST /my-clients falhou')
      return reply.code(500).send({ error: err.message || 'Erro ao salvar' })
    }
  })

  app.put('/my-clients/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { server_id, name, phone, credit_quantity, sell_value, status, notes } = req.body
      const sid = parseInt(server_id)
      if (!name || !sid) return reply.code(400).send({ error: 'Nome e servidor são obrigatórios' })

      const res = await query(
        `UPDATE iptv_my_clients SET server_id=$1, name=$2, phone=$3, credit_quantity=$4, sell_value=$5, status=$6, notes=$7, updated_at=NOW()
         WHERE id=$8 AND user_id=$9 RETURNING *`,
        [sid, name, phone || null, parseInt(credit_quantity) || 1, parseFloat(sell_value) || 0, status || 'active', notes || null, req.params.id, req.user.id]
      )
      if (!res.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })
      return res.rows[0]
    } catch (err) {
      req.log.error({ err: err.message }, 'PUT /my-clients falhou')
      return reply.code(500).send({ error: err.message || 'Erro ao salvar' })
    }
  })

  app.delete('/my-clients/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const res = await query(`DELETE FROM iptv_my_clients WHERE id=$1 AND user_id=$2 RETURNING name`, [req.params.id, req.user.id])
    if (!res.rows[0]) return reply.code(404).send({ error: 'Nao encontrado' })
    return { ok: true }
  })

  // ══════════════════════════════════════════════════════════════
  // DÍVIDAS IPTV
  // ══════════════════════════════════════════════════════════════

  app.addHook('onReady', async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS iptv_debts (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(30),
        type VARCHAR(20) NOT NULL DEFAULT 'receivable',
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        due_date DATE,
        status VARCHAR(20) DEFAULT 'pending',
        notes TEXT,
        reseller_id INTEGER REFERENCES iptv_resellers(id) ON DELETE SET NULL,
        client_id INTEGER REFERENCES iptv_my_clients(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
  })

  app.get('/debts', { preHandler: [app.authenticate] }, async (req) => {
    const { status, type, start_date, end_date } = req.query
    let where = 'd.user_id = $1'
    const params = [req.user.id]
    if (status) { params.push(status); where += ` AND d.status = $${params.length}` }
    if (type) { params.push(type); where += ` AND d.type = $${params.length}` }
    if (start_date) { params.push(start_date); where += ` AND d.due_date >= $${params.length}` }
    if (end_date) { params.push(end_date); where += ` AND d.due_date <= $${params.length}` }
    const res = await query(`
      SELECT d.*,
        r.name AS reseller_name,
        mc.name AS client_name
      FROM iptv_debts d
      LEFT JOIN iptv_resellers r ON r.id = d.reseller_id
      LEFT JOIN iptv_my_clients mc ON mc.id = d.client_id
      WHERE ${where} ORDER BY d.due_date ASC NULLS LAST, d.created_at DESC
    `, params)
    return res.rows.map(d => ({
      ...d,
      amount: parseFloat(d.amount),
      paid_amount: parseFloat(d.paid_amount),
      remaining: parseFloat(d.amount) - parseFloat(d.paid_amount)
    }))
  })

  app.get('/debts/stats', { preHandler: [app.authenticate] }, async (req) => {
    const uid = req.user.id
    const res = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pending','partial','overdue')) AS open_count,
        COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('pending','partial','overdue') AND type='receivable'), 0) AS total_receivable,
        COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('pending','partial','overdue') AND type='payable'), 0) AS total_payable,
        COUNT(*) FILTER (WHERE status IN ('pending','partial') AND due_date < CURRENT_DATE) AS overdue_count
      FROM iptv_debts WHERE user_id = $1
    `, [uid])
    const r = res.rows[0]
    return {
      open_count: parseInt(r.open_count),
      total_receivable: parseFloat(r.total_receivable),
      total_payable: parseFloat(r.total_payable),
      overdue_count: parseInt(r.overdue_count)
    }
  })

  app.post('/debts', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { name, phone, type, amount, due_date, notes, reseller_id, client_id } = req.body
    if (!name || !amount) return reply.code(400).send({ error: 'Nome e valor sao obrigatorios' })
    const res = await query(
      `INSERT INTO iptv_debts (user_id, name, phone, type, amount, due_date, notes, reseller_id, client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, name, phone || null, type || 'receivable', amount, due_date || null, notes || null, reseller_id || null, client_id || null]
    )
    return reply.code(201).send(res.rows[0])
  })

  app.put('/debts/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { name, phone, type, amount, due_date, status, notes, reseller_id } = req.body
    const res = await query(
      `UPDATE iptv_debts SET name=$1, phone=$2, type=$3, amount=$4, due_date=$5, status=$6, notes=$7, reseller_id=$8, updated_at=NOW()
       WHERE id=$9 AND user_id=$10 RETURNING *`,
      [name, phone || null, type, amount, due_date || null, status || 'pending', notes || null, reseller_id || null, req.params.id, req.user.id]
    )
    if (!res.rows[0]) return reply.code(404).send({ error: 'Nao encontrado' })
    return res.rows[0]
  })

  app.post('/debts/:id/pay', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { amount } = req.body
    if (!amount || amount <= 0) return reply.code(400).send({ error: 'Valor invalido' })
    const debt = await query(`SELECT * FROM iptv_debts WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id])
    if (!debt.rows[0]) return reply.code(404).send({ error: 'Nao encontrado' })
    const d = debt.rows[0]
    const newPaid = parseFloat(d.paid_amount) + parseFloat(amount)
    const total = parseFloat(d.amount)
    const newStatus = newPaid >= total ? 'paid' : 'partial'
    const res = await query(
      `UPDATE iptv_debts SET paid_amount=$1, status=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [Math.min(newPaid, total), newStatus, req.params.id]
    )
    return res.rows[0]
  })

  app.delete('/debts/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const res = await query(`DELETE FROM iptv_debts WHERE id=$1 AND user_id=$2 RETURNING id`, [req.params.id, req.user.id])
    if (!res.rows[0]) return reply.code(404).send({ error: 'Nao encontrado' })
    return { ok: true }
  })

  // ══════════════════════════════════════════════════════════════
  // STATS / FATURAMENTO
  // ══════════════════════════════════════════════════════════════

  app.get('/stats', { preHandler: [app.authenticate] }, async (req) => {
    const uid = req.user.id
    const serversRes = await query(`
      SELECT s.*,
        COALESCE((SELECT SUM(r.credit_quantity) FROM iptv_resellers r WHERE r.server_id = s.id), 0) AS credits_sold,
        COALESCE((SELECT SUM(r.credit_quantity * r.credit_sell_value) FROM iptv_resellers r WHERE r.server_id = s.id), 0) AS reseller_revenue,
        COALESCE((SELECT SUM(mc.credit_quantity) FROM iptv_my_clients mc WHERE mc.server_id = s.id AND mc.status = 'active'), 0) AS my_clients_count,
        COALESCE((SELECT SUM(mc.credit_quantity * mc.sell_value) FROM iptv_my_clients mc WHERE mc.server_id = s.id AND mc.status = 'active'), 0) AS my_clients_revenue
      FROM iptv_servers s WHERE s.user_id = $1 ORDER BY s.name
    `, [uid])

    let totalRevenue = 0, totalCost = 0, totalCredits = 0, totalMyClients = 0
    const servers = serversRes.rows.map(s => {
      const creditsSold = parseInt(s.credits_sold)
      const myClients = parseInt(s.my_clients_count)
      const resellerRev = parseFloat(s.reseller_revenue)
      const myRev = parseFloat(s.my_clients_revenue)
      const creditValue = parseFloat(s.credit_value)
      // Faturamento/Lucro agregam SÓ revendedores — clientes diretos
      // (Meus Servidores) contam só pro card de contador.
      const cost = creditValue * creditsSold
      const revenue = resellerRev
      totalRevenue += revenue; totalCost += cost; totalCredits += creditsSold; totalMyClients += myClients
      return {
        id: s.id, name: s.name, max_clients: parseInt(s.max_clients), credit_value: creditValue,
        credits_sold: creditsSold, my_clients: myClients, reseller_revenue: resellerRev, my_revenue: myRev,
        revenue, cost, profit: revenue - cost
      }
    })

    const resellersCount = await query(`SELECT COUNT(*) FROM iptv_resellers WHERE user_id = $1`, [uid])

    return {
      total_servers: servers.length,
      total_resellers: parseInt(resellersCount.rows[0].count),
      total_my_clients: totalMyClients,
      total_credits_sold: totalCredits,
      total_revenue: totalRevenue, total_cost: totalCost,
      total_profit: totalRevenue - totalCost,
      margin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0,
      servers
    }
  })
}
