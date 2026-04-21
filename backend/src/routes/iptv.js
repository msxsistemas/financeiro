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
    await query(`ALTER TABLE iptv_resellers ADD COLUMN IF NOT EXISTS period VARCHAR(7)`).catch(() => {})
    await query(`ALTER TABLE iptv_my_clients ADD COLUMN IF NOT EXISTS period VARCHAR(7)`).catch(() => {})
  })

  // Utilitário: garante contato (cria novo se não existir)
  async function ensureContact(userId, name, phone) {
    if (!name || !name.trim()) return null
    const nameLower = name.trim().toLowerCase()
    const existing = await query(
      `SELECT id FROM contacts WHERE user_id = $1 AND LOWER(TRIM(name)) = $2 AND deleted_at IS NULL LIMIT 1`,
      [userId, nameLower]
    )
    if (existing.rows[0]) return existing.rows[0].id
    try {
      const created = await query(
        `INSERT INTO contacts (user_id, name, phone, type) VALUES ($1, $2, $3, 'client') RETURNING id`,
        [userId, name.trim(), phone || null]
      )
      return created.rows[0].id
    } catch {
      return null
    }
  }

  function currentPeriod() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  // Monta fragmento SQL + param para filtrar por período.
  // Aceita 'YYYY-MM' (mês exato) ou 'YYYY' (ano inteiro, via LIKE).
  // Retorna { sql: "col = $N" ou "col LIKE $N", value: '...' }
  function periodFilter(period, colAlias) {
    const col = colAlias ? `${colAlias}.period` : 'period'
    if (period && /^\d{4}$/.test(period)) {
      return { sql: `${col} LIKE `, value: `${period}-%`, op: 'LIKE' }
    }
    return { sql: `${col} = `, value: period || currentPeriod(), op: '=' }
  }

  // ══════════════════════════════════════════════════════════════
  // SERVIDORES & APPS
  // ══════════════════════════════════════════════════════════════

  app.get('/servers', { preHandler: [app.authenticate] }, async (req) => {
    const pf = periodFilter(req.query.period)
    const res = await query(`
      SELECT s.*,
        COALESCE((SELECT SUM(r.credit_quantity) FROM iptv_resellers r WHERE r.server_id = s.id AND r.period ${pf.op} $2), 0) AS credits_sold,
        COALESCE((SELECT SUM(r.credit_quantity * r.credit_sell_value) FROM iptv_resellers r WHERE r.server_id = s.id AND r.period ${pf.op} $2), 0) AS reseller_revenue,
        COALESCE((SELECT SUM(mc.credit_quantity) FROM iptv_my_clients mc WHERE mc.server_id = s.id AND mc.status = 'active' AND mc.period ${pf.op} $2), 0) AS my_clients_count,
        COALESCE((SELECT SUM(mc.credit_quantity * mc.sell_value) FROM iptv_my_clients mc WHERE mc.server_id = s.id AND mc.status = 'active' AND mc.period ${pf.op} $2), 0) AS my_clients_revenue
      FROM iptv_servers s WHERE s.user_id = $1 ORDER BY s.name
    `, [req.user.id, pf.value])
    return res.rows.map(s => {
      const creditValue = parseFloat(s.credit_value)
      const creditsSold = parseInt(s.credits_sold)
      const resellerRev = parseFloat(s.reseller_revenue)
      const myClients = parseInt(s.my_clients_count)
      const myRev = parseFloat(s.my_clients_revenue)
      const revenue = resellerRev + myRev
      const cost = creditValue * (creditsSold + myClients)
      return {
        ...s,
        max_clients: parseInt(s.max_clients),
        credit_value: creditValue,
        credits_sold: creditsSold,
        reseller_revenue: resellerRev,
        my_clients_count: myClients,
        my_clients_revenue: myRev,
        total_revenue: revenue,
        total_cost: cost,
        profit: revenue - cost
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

  // Lista de revendedores conhecidos (distintos por servidor + nome), com
  // últimos valores e flag de lançamento no período atual. Usado para
  // permitir cadastro 1x + lançamento rápido mensal.
  app.get('/resellers/known', { preHandler: [app.authenticate] }, async (req) => {
    const period = req.query.period || currentPeriod()
    const checkPeriod = /^\d{4}$/.test(period) ? currentPeriod() : period
    const res = await query(`
      SELECT DISTINCT ON (r.server_id, LOWER(r.name))
        r.server_id, r.name, r.phone,
        r.credit_sell_value, r.credit_quantity AS last_quantity,
        r.period AS last_period, r.notes,
        s.name AS server_name, s.credit_value AS server_credit_value,
        (SELECT r2.id FROM iptv_resellers r2
          WHERE r2.user_id = $1 AND r2.period = $2
            AND r2.server_id = r.server_id AND LOWER(r2.name) = LOWER(r.name)
          LIMIT 1) AS current_entry_id,
        (SELECT r2.credit_quantity FROM iptv_resellers r2
          WHERE r2.user_id = $1 AND r2.period = $2
            AND r2.server_id = r.server_id AND LOWER(r2.name) = LOWER(r.name)
          LIMIT 1) AS current_quantity
      FROM iptv_resellers r
      LEFT JOIN iptv_servers s ON s.id = r.server_id
      WHERE r.user_id = $1
      ORDER BY r.server_id, LOWER(r.name), r.period DESC, r.updated_at DESC
    `, [req.user.id, checkPeriod])
    return res.rows.map(r => ({
      ...r,
      credit_sell_value: parseFloat(r.credit_sell_value) || 0,
      server_credit_value: parseFloat(r.server_credit_value) || 0,
      last_quantity: parseInt(r.last_quantity) || 0,
      current_quantity: r.current_quantity != null ? parseInt(r.current_quantity) : null,
      has_current_entry: !!r.current_entry_id,
      current_entry_id: r.current_entry_id || null
    }))
  })

  // Histórico mensal de um revendedor (por nome + servidor opcional)
  app.get('/resellers/history', { preHandler: [app.authenticate] }, async (req) => {
    const { name, server_id, months } = req.query
    if (!name) return []
    const limit = Math.min(parseInt(months) || 6, 24)
    const params = [req.user.id, name.trim().toLowerCase()]
    let where = 'user_id = $1 AND LOWER(TRIM(name)) = $2'
    if (server_id) {
      params.push(parseInt(server_id))
      where += ` AND server_id = $${params.length}`
    }
    const res = await query(`
      SELECT period, credit_quantity, credit_sell_value,
        (credit_quantity * credit_sell_value) AS revenue
      FROM iptv_resellers
      WHERE ${where}
      ORDER BY period DESC
      LIMIT ${limit}
    `, params)
    return res.rows.map(r => ({
      period: r.period,
      credit_quantity: parseInt(r.credit_quantity) || 0,
      credit_sell_value: parseFloat(r.credit_sell_value) || 0,
      revenue: parseFloat(r.revenue) || 0
    }))
  })

  app.get('/resellers', { preHandler: [app.authenticate] }, async (req) => {
    const { server_id, period } = req.query
    const pf = periodFilter(period)
    let where = `r.user_id = $1 AND r.period ${pf.op} $2`
    const params = [req.user.id, pf.value]
    if (server_id) { params.push(server_id); where += ` AND r.server_id = $${params.length}` }
    const res = await query(`
      SELECT r.*, s.name AS server_name, s.credit_value AS server_credit_value
      FROM iptv_resellers r LEFT JOIN iptv_servers s ON s.id = r.server_id
      WHERE ${where} ORDER BY r.name
    `, params)
    return res.rows.map(r => {
      const qty = parseInt(r.credit_quantity) || 0
      const sell = parseFloat(r.credit_sell_value) || 0
      const cost = parseFloat(r.server_credit_value) || 0
      return {
        ...r,
        credit_quantity: qty,
        credit_sell_value: sell,
        server_credit_value: cost,
        total_revenue: qty * sell,
        total_cost: qty * cost,
        profit: qty * (sell - cost)
      }
    })
  })

  app.post('/resellers', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { server_id, name, phone, credit_quantity, credit_sell_value, notes, period } = req.body
      const sid = parseInt(server_id)
      if (!name || !sid) return reply.code(400).send({ error: 'Nome e servidor são obrigatórios' })

      const srv = await query('SELECT id FROM iptv_servers WHERE id = $1 AND user_id = $2', [sid, req.user.id])
      if (!srv.rows[0]) return reply.code(400).send({ error: 'Servidor não encontrado' })

      // Cria/reusa contato na agenda pelo nome
      await ensureContact(req.user.id, name, phone)

      const per = period || currentPeriod()
      const qty = parseInt(credit_quantity) || 0
      const sell = parseFloat(credit_sell_value) || 0

      // Upsert: se já existe lançamento no período (mesmo servidor + nome),
      // SOMA a nova quantidade à existente (acumula créditos). Demais campos
      // (telefone, valor/cred, notas) são preservados — para alterá-los, use
      // o botão Editar (PUT).
      const existing = await query(
        `SELECT id, credit_quantity FROM iptv_resellers
         WHERE user_id = $1 AND server_id = $2
           AND LOWER(TRIM(name)) = LOWER(TRIM($3)) AND period = $4
         ORDER BY updated_at DESC LIMIT 1`,
        [req.user.id, sid, name, per]
      )
      if (existing.rows[0]) {
        const res = await query(
          `UPDATE iptv_resellers
              SET credit_quantity = credit_quantity + $1,
                  updated_at = NOW()
            WHERE id = $2 RETURNING *`,
          [qty, existing.rows[0].id]
        )
        const newTotal = parseInt(res.rows[0].credit_quantity) || 0
        const added = qty
        return reply.code(200).send({ ...res.rows[0], _accumulated: true, _added: added, _total: newTotal })
      }

      const res = await query(
        `INSERT INTO iptv_resellers (user_id, server_id, name, phone, credit_quantity, credit_sell_value, notes, period)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.user.id, sid, name.trim(), phone || null, qty, sell, notes || null, per]
      )
      return reply.code(201).send(res.rows[0])
    } catch (err) {
      req.log.error({ err: err.message }, 'POST /resellers falhou')
      return reply.code(500).send({ error: err.message || 'Erro ao salvar' })
    }
  })

  // Mescla duplicatas: para cada grupo (user, server, LOWER(name), period),
  // mantém a linha mais recente (kept) e SOMA as quantidades das demais
  // nessa kept antes de deletá-las. Retorna quantas foram removidas.
  app.post('/resellers/dedupe', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      // 1) Soma quantidades das duplicatas (rn>1) na linha kept (rn=1) por grupo.
      await query(`
        WITH ranked AS (
          SELECT id, server_id, LOWER(TRIM(name)) AS lname, period, credit_quantity,
            ROW_NUMBER() OVER (
              PARTITION BY server_id, LOWER(TRIM(name)), period
              ORDER BY updated_at DESC, id DESC
            ) AS rn
          FROM iptv_resellers
          WHERE user_id = $1
        ),
        kept AS (SELECT id, server_id, lname, period FROM ranked WHERE rn = 1),
        dup_sum AS (
          SELECT k.id AS keep_id, COALESCE(SUM(d.credit_quantity), 0) AS extra
          FROM kept k
          LEFT JOIN ranked d
            ON d.rn > 1 AND d.server_id = k.server_id AND d.lname = k.lname AND d.period = k.period
          GROUP BY k.id
        )
        UPDATE iptv_resellers r
           SET credit_quantity = r.credit_quantity + ds.extra,
               updated_at = NOW()
          FROM dup_sum ds
         WHERE r.id = ds.keep_id AND ds.extra > 0
      `, [req.user.id])

      // 2) Apaga duplicatas
      const del = await query(`
        WITH ranked AS (
          SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY server_id, LOWER(TRIM(name)), period
              ORDER BY updated_at DESC, id DESC
            ) AS rn
          FROM iptv_resellers
          WHERE user_id = $1
        )
        DELETE FROM iptv_resellers
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        RETURNING id
      `, [req.user.id])
      return { removed: del.rows.length }
    } catch (err) {
      req.log.error({ err: err.message }, 'POST /resellers/dedupe falhou')
      return reply.code(500).send({ error: err.message || 'Erro ao mesclar' })
    }
  })

  app.put('/resellers/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { server_id, name, phone, credit_quantity, credit_sell_value, notes } = req.body
      const sid = parseInt(server_id)
      if (!name || !sid) return reply.code(400).send({ error: 'Nome e servidor são obrigatórios' })

      await ensureContact(req.user.id, name, phone)

      const res = await query(
        `UPDATE iptv_resellers SET server_id=$1, name=$2, phone=$3, credit_quantity=$4, credit_sell_value=$5, notes=$6, updated_at=NOW()
         WHERE id=$7 AND user_id=$8 RETURNING *`,
        [sid, name.trim(), phone || null, parseInt(credit_quantity) || 0, parseFloat(credit_sell_value) || 0, notes || null, req.params.id, req.user.id]
      )
      if (!res.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })
      return res.rows[0]
    } catch (err) {
      req.log.error({ err: err.message }, 'PUT /resellers falhou')
      return reply.code(500).send({ error: err.message || 'Erro ao salvar' })
    }
  })

  // Duplicar revendedores de um mês para outro (ex: carregar mês anterior no atual)
  app.post('/resellers/duplicate', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { from_period, to_period } = req.body
      const from = from_period
      const to = to_period || currentPeriod()
      if (!from) return reply.code(400).send({ error: 'from_period obrigatório' })

      const rows = await query(
        `SELECT server_id, name, phone, credit_quantity, credit_sell_value, notes
         FROM iptv_resellers WHERE user_id = $1 AND period = $2`,
        [req.user.id, from]
      )
      let inserted = 0
      for (const r of rows.rows) {
        // Evita duplicar se já tiver linha para o mesmo nome+server+período destino
        const existing = await query(
          `SELECT id FROM iptv_resellers WHERE user_id = $1 AND period = $2 AND server_id = $3 AND LOWER(name) = LOWER($4)`,
          [req.user.id, to, r.server_id, r.name]
        )
        if (existing.rows[0]) continue
        await query(
          `INSERT INTO iptv_resellers (user_id, server_id, name, phone, credit_quantity, credit_sell_value, notes, period)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [req.user.id, r.server_id, r.name, r.phone, r.credit_quantity, r.credit_sell_value, r.notes, to]
        )
        inserted++
      }
      return { inserted, from, to }
    } catch (err) {
      req.log.error({ err: err.message }, 'POST /resellers/duplicate falhou')
      return reply.code(500).send({ error: err.message || 'Erro ao duplicar' })
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
    const { server_id, period } = req.query
    const pf = periodFilter(period)
    let where = `mc.user_id = $1 AND mc.period ${pf.op} $2`
    const params = [req.user.id, pf.value]
    if (server_id) { params.push(server_id); where += ` AND mc.server_id = $${params.length}` }
    const res = await query(`
      SELECT mc.*, s.name AS server_name, s.credit_value AS server_credit_value
      FROM iptv_my_clients mc LEFT JOIN iptv_servers s ON s.id = mc.server_id
      WHERE ${where} ORDER BY mc.name
    `, params)
    return res.rows.map(c => {
      const qty = parseInt(c.credit_quantity) || 0
      const sell = parseFloat(c.sell_value) || 0
      const credit = parseFloat(c.server_credit_value) || 0
      const revenue = qty * sell
      const cost = qty * credit
      return {
        ...c,
        credit_quantity: qty,
        sell_value: sell,
        server_credit_value: credit,
        total_revenue: revenue,
        total_cost: cost,
        profit: revenue - cost
      }
    })
  })

  app.post('/my-clients', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { server_id, name, phone, credit_quantity, sell_value, notes, period } = req.body
      const sid = parseInt(server_id)
      if (!name || !sid) return reply.code(400).send({ error: 'Nome e servidor são obrigatórios' })

      const srv = await query('SELECT id FROM iptv_servers WHERE id = $1 AND user_id = $2', [sid, req.user.id])
      if (!srv.rows[0]) return reply.code(400).send({ error: 'Servidor não encontrado' })

      await ensureContact(req.user.id, name, phone)

      const res = await query(
        `INSERT INTO iptv_my_clients (user_id, server_id, name, phone, credit_quantity, sell_value, notes, period)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.user.id, sid, name.trim(), phone || null, parseInt(credit_quantity) || 1, parseFloat(sell_value) || 0, notes || null, period || currentPeriod()]
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

      await ensureContact(req.user.id, name, phone)

      const res = await query(
        `UPDATE iptv_my_clients SET server_id=$1, name=$2, phone=$3, credit_quantity=$4, sell_value=$5, status=$6, notes=$7, updated_at=NOW()
         WHERE id=$8 AND user_id=$9 RETURNING *`,
        [sid, name.trim(), phone || null, parseInt(credit_quantity) || 1, parseFloat(sell_value) || 0, status || 'active', notes || null, req.params.id, req.user.id]
      )
      if (!res.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })
      return res.rows[0]
    } catch (err) {
      req.log.error({ err: err.message }, 'PUT /my-clients falhou')
      return reply.code(500).send({ error: err.message || 'Erro ao salvar' })
    }
  })

  app.post('/my-clients/duplicate', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const { from_period, to_period } = req.body
      const from = from_period
      const to = to_period || currentPeriod()
      if (!from) return reply.code(400).send({ error: 'from_period obrigatório' })

      const rows = await query(
        `SELECT server_id, name, phone, credit_quantity, sell_value, status, notes
         FROM iptv_my_clients WHERE user_id = $1 AND period = $2`,
        [req.user.id, from]
      )
      let inserted = 0
      for (const r of rows.rows) {
        const existing = await query(
          `SELECT id FROM iptv_my_clients WHERE user_id = $1 AND period = $2 AND server_id = $3 AND LOWER(name) = LOWER($4)`,
          [req.user.id, to, r.server_id, r.name]
        )
        if (existing.rows[0]) continue
        await query(
          `INSERT INTO iptv_my_clients (user_id, server_id, name, phone, credit_quantity, sell_value, status, notes, period)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [req.user.id, r.server_id, r.name, r.phone, r.credit_quantity, r.sell_value, r.status || 'active', r.notes, to]
        )
        inserted++
      }
      return { inserted, from, to }
    } catch (err) {
      req.log.error({ err: err.message }, 'POST /my-clients/duplicate falhou')
      return reply.code(500).send({ error: err.message || 'Erro ao duplicar' })
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
    await query(`ALTER TABLE iptv_debts ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false`).catch(() => {})
    await query(`ALTER TABLE iptv_debts ADD COLUMN IF NOT EXISTS recurrence_next_date DATE`).catch(() => {})
    await query(`
      CREATE INDEX IF NOT EXISTS idx_iptv_debts_recurrence_next
        ON iptv_debts (recurrence_next_date)
        WHERE is_recurring = true
    `).catch(() => {})
  })

  // Soma 1 mês a uma data YYYY-MM-DD preservando o dia (31/jan → 28/fev)
  function addOneMonth(dateStr) {
    const parts = String(dateStr).substring(0, 10).split('-')
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0)
    const targetDay = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + 1)
    const lastDayOfNext = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(targetDay, lastDayOfNext))
    const pad2 = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }

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
    const { name, phone, type, amount, due_date, notes, reseller_id, client_id, is_recurring } = req.body
    if (!name || !amount) return reply.code(400).send({ error: 'Nome e valor sao obrigatorios' })
    // Recorrência mensal só faz sentido com due_date definido
    const recurring = !!is_recurring && !!due_date
    const nextDate = recurring ? addOneMonth(due_date) : null
    const res = await query(
      `INSERT INTO iptv_debts (user_id, name, phone, type, amount, due_date, notes, reseller_id, client_id, is_recurring, recurrence_next_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.id, name, phone || null, type || 'receivable', amount, due_date || null, notes || null, reseller_id || null, client_id || null, recurring, nextDate]
    )
    return reply.code(201).send(res.rows[0])
  })

  app.put('/debts/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { name, phone, type, amount, due_date, status, notes, reseller_id, is_recurring } = req.body
    const check = await query('SELECT due_date, is_recurring FROM iptv_debts WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])
    if (!check.rows[0]) return reply.code(404).send({ error: 'Nao encontrado' })
    const cur = check.rows[0]
    const newRecurring = is_recurring != null ? !!is_recurring : !!cur.is_recurring
    const newDue = due_date ?? (cur.due_date ? String(cur.due_date).substring(0, 10) : null)
    const nextDate = newRecurring && newDue ? addOneMonth(newDue) : null
    const res = await query(
      `UPDATE iptv_debts SET name=$1, phone=$2, type=$3, amount=$4, due_date=$5, status=$6, notes=$7, reseller_id=$8,
         is_recurring=$9, recurrence_next_date=$10, updated_at=NOW()
       WHERE id=$11 AND user_id=$12 RETURNING *`,
      [name, phone || null, type, amount, due_date || null, status || 'pending', notes || null, reseller_id || null,
        newRecurring, nextDate, req.params.id, req.user.id]
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
    const pf = periodFilter(req.query.period)
    const serversRes = await query(`
      SELECT s.*,
        COALESCE((SELECT SUM(r.credit_quantity) FROM iptv_resellers r WHERE r.server_id = s.id AND r.period ${pf.op} $2), 0) AS credits_sold,
        COALESCE((SELECT SUM(r.credit_quantity * r.credit_sell_value) FROM iptv_resellers r WHERE r.server_id = s.id AND r.period ${pf.op} $2), 0) AS reseller_revenue,
        COALESCE((SELECT SUM(mc.credit_quantity) FROM iptv_my_clients mc WHERE mc.server_id = s.id AND mc.status = 'active' AND mc.period ${pf.op} $2), 0) AS my_clients_count,
        COALESCE((SELECT SUM(mc.credit_quantity * mc.sell_value) FROM iptv_my_clients mc WHERE mc.server_id = s.id AND mc.status = 'active' AND mc.period ${pf.op} $2), 0) AS my_clients_revenue
      FROM iptv_servers s WHERE s.user_id = $1 ORDER BY s.name
    `, [uid, pf.value])

    let resellerRevenue = 0, resellerCost = 0, resellerCredits = 0
    let myClientsRevenue = 0, myClientsCost = 0, myClientsCount = 0

    const servers = serversRes.rows.map(s => {
      const creditsSold = parseInt(s.credits_sold)
      const myClients = parseInt(s.my_clients_count)
      const resellerRev = parseFloat(s.reseller_revenue)
      const myRev = parseFloat(s.my_clients_revenue)
      const creditValue = parseFloat(s.credit_value)

      resellerRevenue += resellerRev
      resellerCost += creditValue * creditsSold
      resellerCredits += creditsSold

      myClientsRevenue += myRev
      myClientsCost += creditValue * myClients
      myClientsCount += myClients

      const revenue = resellerRev + myRev
      const cost = creditValue * (creditsSold + myClients)
      return {
        id: s.id, name: s.name, max_clients: parseInt(s.max_clients), credit_value: creditValue,
        credits_sold: creditsSold, my_clients: myClients, reseller_revenue: resellerRev, my_revenue: myRev,
        revenue, cost, profit: revenue - cost
      }
    })

    const resellersCount = await query(
      `SELECT COUNT(*) FROM iptv_resellers WHERE user_id = $1 AND period ${pf.op} $2`,
      [uid, pf.value]
    )
    const myServersCount = serversRes.rows.length

    const totalRevenue = resellerRevenue + myClientsRevenue
    const totalCost = resellerCost + myClientsCost

    return {
      // Agregados globais (mantidos por compat, mas o frontend deve usar os breakdowns por aba)
      total_servers: myServersCount,
      total_resellers: parseInt(resellersCount.rows[0].count),
      total_my_clients: myClientsCount,
      total_credits_sold: resellerCredits,
      total_revenue: totalRevenue, total_cost: totalCost,
      total_profit: totalRevenue - totalCost,
      margin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0,

      // Breakdown por aba
      servers_tab: {
        servers_count: myServersCount,
        total_credits: resellerCredits + myClientsCount,
        revenue: totalRevenue,
        cost: totalCost,
        profit: totalRevenue - totalCost,
        margin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0
      },
      resellers_tab: {
        count: parseInt(resellersCount.rows[0].count),
        credits_sold: resellerCredits,
        revenue: resellerRevenue,
        cost: resellerCost,
        profit: resellerRevenue - resellerCost,
        margin: resellerRevenue > 0 ? ((resellerRevenue - resellerCost) / resellerRevenue * 100) : 0
      },
      my_clients_tab: {
        count: myClientsCount,
        revenue: myClientsRevenue,
        cost: myClientsCost,
        profit: myClientsRevenue - myClientsCost,
        margin: myClientsRevenue > 0 ? ((myClientsRevenue - myClientsCost) / myClientsRevenue * 100) : 0
      },

      servers
    }
  })
}
