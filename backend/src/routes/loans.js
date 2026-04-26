import { query, logActivity } from '../db/index.js'
import axios from 'axios'
import PDFDocument from 'pdfkit'
import { MESSAGE_DEFAULTS, interpolate, fmtBRL } from '../utils/messageTemplates.js'

const UAZAPI_URL = process.env.UAZAPI_URL

// Gera parcelas com base nos parâmetros do empréstimo
function generateInstallments(loan) {
  const { principal_amount, interest_rate, interest_type, frequency, installments, user_id, id } = loan
  // Normalize first_due_date: PostgreSQL returns date columns as JS Date objects
  const firstDueDateStr = loan.first_due_date instanceof Date
    ? loan.first_due_date.toISOString().split('T')[0]
    : String(loan.first_due_date).substring(0, 10)
  const rate = parseFloat(interest_rate) / 100
  const principal = parseFloat(principal_amount)
  const n = parseInt(installments)

  const rows = []

  if (interest_type === 'compound' && rate > 0) {
    // Juros compostos (Tabela Price): PMT = PV * r(1+r)^n / [(1+r)^n - 1]
    // Cada parcela tem o mesmo valor total mas com amortização crescente e juros decrescentes
    const pmt = principal * (rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1)
    let balance = principal

    for (let i = 1; i <= n; i++) {
      let dueDate = new Date(firstDueDateStr + 'T12:00:00')
      if (frequency === 'daily') dueDate.setDate(dueDate.getDate() + (i - 1))
      else if (frequency === 'weekly') dueDate.setDate(dueDate.getDate() + (i - 1) * 7)
      else dueDate.setMonth(dueDate.getMonth() + (i - 1))

      const interest = balance * rate
      const amort = pmt - interest
      balance -= amort

      rows.push({
        loan_id: id,
        installment_number: i,
        due_date: dueDate.toISOString().split('T')[0],
        principal_amount: parseFloat(amort.toFixed(2)),
        interest_amount: parseFloat(interest.toFixed(2)),
        late_fee_amount: 0,
        total_amount: parseFloat(pmt.toFixed(2)),
        user_id
      })
    }
  } else {
    // Juros simples: taxa aplicada uma única vez sobre o principal,
    // total = P × (1 + i), distribuído igualmente em n parcelas
    // Ex: 400 a 80% em 4x = (400 × 1.80) / 4 = 180 por parcela
    const totalInterest = principal * rate
    const totalDue = principal + totalInterest
    const installmentTotal = totalDue / n
    const installmentPrincipal = principal / n
    const installmentInterest = totalInterest / n

    let accTotal = 0, accPrincipal = 0, accInterest = 0

    for (let i = 1; i <= n; i++) {
      let dueDate = new Date(firstDueDateStr + 'T12:00:00')
      if (frequency === 'daily') dueDate.setDate(dueDate.getDate() + (i - 1))
      else if (frequency === 'weekly') dueDate.setDate(dueDate.getDate() + (i - 1) * 7)
      else dueDate.setMonth(dueDate.getMonth() + (i - 1))

      // Última parcela absorve resíduo de arredondamento
      const total = i === n ? totalDue - accTotal : installmentTotal
      const principalThis = i === n ? principal - accPrincipal : installmentPrincipal
      const interestThis = i === n ? totalInterest - accInterest : installmentInterest
      accTotal += total; accPrincipal += principalThis; accInterest += interestThis

      rows.push({
        loan_id: id,
        installment_number: i,
        due_date: dueDate.toISOString().split('T')[0],
        principal_amount: parseFloat(principalThis.toFixed(2)),
        interest_amount: parseFloat(interestThis.toFixed(2)),
        late_fee_amount: 0,
        total_amount: parseFloat(total.toFixed(2)),
        user_id
      })
    }
  }

  return rows
}

// Calcula mora acumulada (valor fixo em R$ por dia de atraso)
function calcLateFee(inst, loan) {
  const daily = parseFloat(loan.late_fee_rate) || 0
  if (daily <= 0 || inst.paid) return 0
  const dueStr = inst.due_date instanceof Date
    ? inst.due_date.toISOString().split('T')[0]
    : String(inst.due_date).substring(0, 10)
  const dueDate = new Date(dueStr + 'T12:00:00')
  const today = new Date()
  if (today <= dueDate) return 0
  const days = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 0
  return parseFloat((daily * days).toFixed(2))
}

const createLoanSchema = {
  body: {
    type: 'object',
    required: ['principal_amount', 'first_due_date'],
    properties: {
      contact_id: { type: ['string', 'null'] },
      contact_name: { type: ['string', 'null'], maxLength: 200 },
      contact_phone: { type: ['string', 'null'], maxLength: 20 },
      principal_amount: { type: 'number', exclusiveMinimum: 0 },
      interest_rate: { type: 'number', minimum: 0, maximum: 100 },
      interest_type: { type: 'string', enum: ['simple', 'compound'] },
      frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
      installments: { type: 'integer', minimum: 1, maximum: 360 },
      start_date: { type: ['string', 'null'] },
      first_due_date: { type: 'string' },
      late_fee_rate: { type: ['number', 'null'], minimum: 0 },
      notes: { type: ['string', 'null'], maxLength: 2000 },
      auto_notify: { type: 'boolean' },
      notify_days_before: { type: 'integer', minimum: 0, maximum: 30 },
      custom_message: { type: ['string', 'null'], maxLength: 2000 }
    }
  }
}

const payInstallmentSchema = {
  body: {
    type: 'object',
    properties: {
      paid_amount: { type: 'number', exclusiveMinimum: 0 },
      notes: { type: ['string', 'null'], maxLength: 500 }
    }
  }
}

export default async function loansRoutes(app) {

  // Mensagem padrão (template) do usuário — legado, mantido para compat do modal em Loans.jsx.
  // Hoje representa o template de "parcela a vencer"; templates completos ficam em /api/message-templates.
  app.get('/default-message', { preHandler: [app.authenticate] }, async (request) => {
    const r = await query('SELECT loan_default_message FROM users WHERE id = $1', [request.user.id])
    return {
      message: r.rows[0]?.loan_default_message || MESSAGE_DEFAULTS.loan_upcoming,
      is_default: !r.rows[0]?.loan_default_message,
      default_template: MESSAGE_DEFAULTS.loan_upcoming
    }
  })

  app.put('/default-message', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { message } = request.body
    await query('UPDATE users SET loan_default_message = $1 WHERE id = $2', [message || null, request.user.id])
    return { ok: true }
  })

  // Histórico consolidado por devedor (agrupa pelo nome do contato)
  app.get('/contact-summary', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { name, contact_id } = request.query
    if (!name && !contact_id) return reply.code(400).send({ error: 'Informe name ou contact_id' })

    const conditions = ['l.user_id = $1', 'l.deleted_at IS NULL']
    const params = [userId]
    if (contact_id) { conditions.push(`l.contact_id = $${params.length + 1}`); params.push(contact_id) }
    else { conditions.push(`l.contact_name ILIKE $${params.length + 1}`); params.push(name) }

    const loansRes = await query(`
      SELECT l.*,
        COUNT(li.id) FILTER (WHERE NOT li.paid) AS installments_pending,
        COUNT(li.id) FILTER (WHERE li.paid) AS installments_paid,
        COUNT(li.id) AS installments_total,
        COALESCE(SUM(li.total_amount + li.late_fee_amount) FILTER (WHERE NOT li.paid), 0) AS amount_remaining,
        COALESCE(SUM(li.paid_amount) FILTER (WHERE li.paid), 0) AS amount_paid,
        MIN(li.due_date) FILTER (WHERE NOT li.paid) AS next_due_date,
        COUNT(li.id) FILTER (WHERE NOT li.paid AND li.due_date < CURRENT_DATE) AS installments_overdue
      FROM loans l
      LEFT JOIN loan_installments li ON li.loan_id = l.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `, params)

    // Histórico de pagamentos (parcelas pagas) com agrupamento por mês
    const paymentsRes = await query(`
      SELECT li.paid_at, li.paid_amount, li.installment_number, l.id AS loan_id, l.principal_amount AS loan_principal
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      WHERE ${conditions.join(' AND ')} AND li.paid = true
      ORDER BY li.paid_at DESC
      LIMIT 50
    `, params)

    const loans = loansRes.rows
    const first = loans[loans.length - 1]
    const contact = {
      name: first?.contact_name || name || null,
      phone: first?.contact_phone || null,
      contact_id: first?.contact_id || contact_id || null
    }

    const summary = {
      total_lent: loans.reduce((s, l) => s + parseFloat(l.principal_amount || 0), 0),
      total_paid: loans.reduce((s, l) => s + parseFloat(l.amount_paid || 0), 0),
      total_owed: loans.reduce((s, l) => s + parseFloat(l.amount_remaining || 0), 0),
      loans_count: {
        active: loans.filter(l => l.status === 'active').length,
        paid: loans.filter(l => l.status === 'paid').length,
        defaulted: loans.filter(l => l.status === 'defaulted').length,
        total: loans.length
      },
      installments: {
        paid: loans.reduce((s, l) => s + parseInt(l.installments_paid || 0), 0),
        pending: loans.reduce((s, l) => s + parseInt(l.installments_pending || 0), 0),
        overdue: loans.reduce((s, l) => s + parseInt(l.installments_overdue || 0), 0)
      },
      first_loan_at: loans.length ? loans[loans.length - 1].created_at : null,
      last_loan_at: loans.length ? loans[0].created_at : null
    }

    return { contact, summary, loans, payments: paymentsRes.rows }
  })

  // Listar empréstimos
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const { status, search, page = 1, limit = 20, start_date, end_date } = request.query

    const conditions = ['l.user_id = $1', 'l.deleted_at IS NULL']
    const params = [userId]
    let idx = 2

    if (status) { conditions.push(`l.status = $${idx++}`); params.push(status) }
    if (start_date) { conditions.push(`l.first_due_date >= $${idx++}`); params.push(start_date) }
    if (end_date) { conditions.push(`l.first_due_date <= $${idx++}`); params.push(end_date) }
    if (search) {
      conditions.push(`l.contact_name ILIKE $${idx++}`)
      params.push(`%${search}%`)
    }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const where = conditions.join(' AND ')

    const countRes = await query(`SELECT COUNT(*) FROM loans l WHERE ${where}`, params)
    const total = parseInt(countRes.rows[0].count)

    const result = await query(`
      SELECT l.*,
        COUNT(li.id) FILTER (WHERE NOT li.paid) AS installments_pending,
        COUNT(li.id) FILTER (WHERE li.paid) AS installments_paid,
        COUNT(li.id) AS installments_total,
        COALESCE(SUM(li.total_amount + li.late_fee_amount) FILTER (WHERE NOT li.paid), 0) AS amount_remaining,
        COALESCE(SUM(li.paid_amount) FILTER (WHERE li.paid), 0) AS amount_paid,
        MIN(li.due_date) FILTER (WHERE NOT li.paid) AS next_due_date,
        COUNT(li.id) FILTER (WHERE NOT li.paid AND li.due_date < CURRENT_DATE) AS installments_overdue
      FROM loans l
      LEFT JOIN loan_installments li ON li.loan_id = l.id
      WHERE ${where}
      GROUP BY l.id
      ORDER BY
        CASE WHEN l.status = 'active' THEN 0 ELSE 1 END,
        MIN(li.due_date) FILTER (WHERE NOT li.paid) ASC NULLS LAST
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, parseInt(limit), offset])

    return { data: result.rows, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) }
  })

  // Buscar empréstimo por ID com parcelas
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.id

    const loanRes = await query('SELECT * FROM loans WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, userId])
    if (!loanRes.rows[0]) return reply.code(404).send({ error: 'Empréstimo não encontrado' })
    const loan = loanRes.rows[0]

    const installRes = await query(`
      SELECT * FROM loan_installments WHERE loan_id = $1 ORDER BY installment_number
    `, [id])

    // Atualizar mora dinamicamente para parcelas vencidas e não pagas
    const updatedInstallments = await Promise.all(installRes.rows.map(async (inst) => {
      const newFee = calcLateFee(inst, loan)
      if (!inst.paid && newFee !== parseFloat(inst.late_fee_amount)) {
        await query('UPDATE loan_installments SET late_fee_amount = $1 WHERE id = $2', [newFee, inst.id])
        return { ...inst, late_fee_amount: newFee }
      }
      return inst
    }))

    const amount_remaining = updatedInstallments.reduce((s, i) => {
      if (i.paid) return s
      const total = parseFloat(i.total_amount) + parseFloat(i.late_fee_amount || 0)
      const paid = parseFloat(i.paid_amount || 0)
      return s + Math.max(0, total - paid)
    }, 0)
    const amount_paid = updatedInstallments.reduce((s, i) => s + parseFloat(i.paid_amount || 0), 0)
    const installments_paid = updatedInstallments.filter(i => i.paid).length
    const installments_total = updatedInstallments.length

    return {
      ...loan,
      amount_remaining,
      amount_paid,
      installments_paid,
      installments_total,
      installments_list: updatedInstallments
    }
  })

  // Criar empréstimo
  app.post('/', { schema: createLoanSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const {
      contact_id, contact_name, contact_phone,
      principal_amount, interest_rate, interest_type,
      frequency, installments, start_date, first_due_date,
      late_fee_rate, notes, auto_notify, notify_days_before,
      custom_message
    } = request.body

    if (!principal_amount || !first_due_date) {
      return reply.code(400).send({ error: 'Valor e data da primeira parcela são obrigatórios' })
    }

    // Buscar dados do contato se fornecido
    let cName = contact_name
    let cPhone = contact_phone
    if (contact_id) {
      const cRes = await query('SELECT name, phone FROM contacts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [contact_id, userId])
      if (cRes.rows[0]) { cName = cRes.rows[0].name; cPhone = cRes.rows[0].phone }
    }

    const loanRes = await query(`
      INSERT INTO loans (
        contact_id, contact_name, contact_phone,
        principal_amount, interest_rate, interest_type,
        frequency, installments, start_date, first_due_date,
        late_fee_rate, notes, auto_notify, notify_days_before, custom_message, user_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      contact_id || null, cName || null, cPhone || null,
      principal_amount, interest_rate || 0, interest_type || 'simple',
      frequency || 'monthly', installments || 1,
      start_date || new Date().toISOString().split('T')[0],
      first_due_date, late_fee_rate || 0, notes || null,
      auto_notify || false, notify_days_before || 1, custom_message || null, userId
    ])

    const loan = loanRes.rows[0]
    const parcelas = generateInstallments(loan)

    for (const p of parcelas) {
      await query(`
        INSERT INTO loan_installments
          (loan_id, installment_number, due_date, principal_amount, interest_amount, late_fee_amount, total_amount, user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [p.loan_id, p.installment_number, p.due_date, p.principal_amount, p.interest_amount, p.late_fee_amount, p.total_amount, p.user_id])
    }

    await logActivity(userId, 'LOAN_CREATE', 'loan', loan.id, `Empréstimo criado: ${cName} - R$ ${principal_amount}`)
    return reply.code(201).send(loan)
  })

  // Atualizar empréstimo
  app.put('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.id
    const {
      contact_id, contact_name, contact_phone, notes,
      auto_notify, notify_days_before, status, custom_message,
      principal_amount, interest_rate, interest_type, frequency,
      installments, start_date, first_due_date, late_fee_rate
    } = request.body

    const curRes = await query('SELECT * FROM loans WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, userId])
    if (!curRes.rows[0]) return reply.code(404).send({ error: 'Empréstimo não encontrado' })
    const current = curRes.rows[0]

    // Detecta se algum parâmetro que gera parcelas foi alterado
    const normDate = (d) => d instanceof Date ? d.toISOString().substring(0, 10) : (d ? String(d).substring(0, 10) : null)
    const financialChanged =
      (principal_amount != null && parseFloat(principal_amount) !== parseFloat(current.principal_amount)) ||
      (interest_rate != null && parseFloat(interest_rate) !== parseFloat(current.interest_rate)) ||
      (interest_type != null && interest_type !== current.interest_type) ||
      (frequency != null && frequency !== current.frequency) ||
      (installments != null && parseInt(installments) !== parseInt(current.installments)) ||
      (first_due_date != null && normDate(first_due_date) !== normDate(current.first_due_date)) ||
      (start_date != null && normDate(start_date) !== normDate(current.start_date))

    if (financialChanged) {
      const paidRes = await query(
        'SELECT COUNT(*)::int AS c FROM loan_installments WHERE loan_id = $1 AND (paid = true OR paid_amount > 0)',
        [id]
      )
      if (paidRes.rows[0].c > 0) {
        return reply.code(400).send({
          error: 'Existem parcelas com pagamento registrado — não é possível alterar valor, juros, parcelas ou datas. Edite apenas dados do contato e observações.'
        })
      }
    }

    const res = await query(`
      UPDATE loans SET
        contact_id = $1,
        contact_name = COALESCE($2, contact_name),
        contact_phone = COALESCE($3, contact_phone),
        notes = $4,
        auto_notify = COALESCE($5, auto_notify),
        notify_days_before = COALESCE($6, notify_days_before),
        status = COALESCE($7, status),
        custom_message = $8,
        principal_amount = COALESCE($9, principal_amount),
        interest_rate = COALESCE($10, interest_rate),
        interest_type = COALESCE($11, interest_type),
        frequency = COALESCE($12, frequency),
        installments = COALESCE($13, installments),
        start_date = COALESCE($14, start_date),
        first_due_date = COALESCE($15, first_due_date),
        late_fee_rate = COALESCE($16, late_fee_rate)
      WHERE id = $17 AND user_id = $18 AND deleted_at IS NULL
      RETURNING *
    `, [
      contact_id ?? null,
      contact_name, contact_phone,
      notes ?? null,
      auto_notify, notify_days_before, status,
      custom_message ?? null,
      principal_amount ?? null,
      interest_rate ?? null,
      interest_type ?? null,
      frequency ?? null,
      installments ?? null,
      start_date ?? null,
      first_due_date ?? null,
      late_fee_rate ?? null,
      id, userId
    ])

    const loan = res.rows[0]

    if (financialChanged) {
      await query('DELETE FROM loan_installments WHERE loan_id = $1', [id])
      const parcelas = generateInstallments(loan)
      for (const p of parcelas) {
        await query(`
          INSERT INTO loan_installments
            (loan_id, installment_number, due_date, principal_amount, interest_amount, late_fee_amount, total_amount, user_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [p.loan_id, p.installment_number, p.due_date, p.principal_amount, p.interest_amount, p.late_fee_amount, p.total_amount, p.user_id])
      }
    }

    await logActivity(userId, 'LOAN_UPDATE', 'loan', loan.id, `Empréstimo atualizado: ${loan.contact_name}`)
    return loan
  })

  // Deletar empréstimo
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const res = await query('UPDATE loans SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id',
      [request.params.id, request.user.id])
    if (!res.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })
    return { message: 'Empréstimo excluído' }
  })

  // Reabrir empréstimo (desfazer "Quitado")
  app.post('/:id/reopen', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { id } = request.params
    const curRes = await query(
      'SELECT id, contact_name, status FROM loans WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, userId]
    )
    if (!curRes.rows[0]) return reply.code(404).send({ error: 'Empréstimo não encontrado' })
    if (curRes.rows[0].status !== 'paid') {
      return reply.code(400).send({ error: 'Apenas empréstimos quitados podem ser reabertos' })
    }
    await query("UPDATE loans SET status = 'active' WHERE id = $1", [id])
    await logActivity(userId, 'LOAN_REOPEN', 'loan', id, `Empréstimo reaberto: ${curRes.rows[0].contact_name}`)
    return { message: 'Empréstimo reaberto' }
  })

  // Registrar pagamento de parcela
  app.post('/installments/:id/pay', { schema: payInstallmentSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { id } = request.params
    const { paid_amount, notes } = request.body

    const instRes = await query(
      'SELECT li.*, l.contact_name FROM loan_installments li JOIN loans l ON l.id = li.loan_id WHERE li.id = $1 AND li.user_id = $2 AND l.deleted_at IS NULL',
      [id, userId]
    )
    if (!instRes.rows[0]) return reply.code(404).send({ error: 'Parcela não encontrada' })

    const inst = instRes.rows[0]
    const totalDue = parseFloat(inst.total_amount) + parseFloat(inst.late_fee_amount)
    const amount = parseFloat(paid_amount) || totalDue

    await query(`
      UPDATE loan_installments
      SET paid = true, paid_at = NOW(), paid_amount = $1, notes = COALESCE($2, notes)
      WHERE id = $3
    `, [amount, notes || null, id])

    // Verificar se todas as parcelas estão pagas
    const pendingRes = await query(
      'SELECT COUNT(*) FROM loan_installments WHERE loan_id = $1 AND NOT paid',
      [inst.loan_id]
    )
    if (parseInt(pendingRes.rows[0].count) === 0) {
      await query("UPDATE loans SET status = 'paid' WHERE id = $1", [inst.loan_id])
    }

    await logActivity(userId, 'LOAN_PAYMENT', 'loan', inst.loan_id,
      `Parcela ${inst.installment_number} paga - R$ ${amount} (${inst.contact_name})`)

    return { message: 'Pagamento registrado' }
  })

  // Recibo PDF de parcela paga
  app.get('/installments/:id/receipt', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { id } = request.params

    const instRes = await query(`
      SELECT li.*, l.contact_name, l.contact_phone, l.principal_amount, l.interest_rate, l.installments
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      WHERE li.id = $1 AND li.user_id = $2 AND l.deleted_at IS NULL
    `, [id, userId])
    if (!instRes.rows[0]) return reply.code(404).send({ error: 'Parcela não encontrada' })

    const inst = instRes.rows[0]
    const userRes = await query('SELECT name FROM users WHERE id = $1', [userId])
    const user = userRes.rows[0]
    const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

    const doc = new PDFDocument({ size: 'A5', margin: 40 })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))

    await new Promise(resolve => {
      doc.on('end', resolve)

      // Header
      doc.rect(0, 0, 420, 70).fill('#4f46e5')
      doc.fillColor('white').fontSize(20).font('Helvetica-Bold').text('RECIBO DE PAGAMENTO', 40, 20)
      doc.fontSize(10).font('Helvetica').text(user.name || '', 40, 48)

      doc.fillColor('#111827').font('Helvetica')

      // Data emissão
      const now = new Date()
      doc.fontSize(9).fillColor('#6b7280')
        .text(`Emitido em: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 40, 85)

      doc.moveTo(40, 100).lineTo(380, 100).strokeColor('#e5e7eb').stroke()

      // Devedor
      doc.y = 115
      doc.fontSize(9).fillColor('#6b7280').text('DEVEDOR')
      doc.fontSize(13).fillColor('#111827').font('Helvetica-Bold').text(inst.contact_name || '—')
      if (inst.contact_phone) {
        doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(`📱 ${inst.contact_phone}`)
      }

      doc.y += 5
      doc.moveTo(40, doc.y).lineTo(380, doc.y).strokeColor('#e5e7eb').stroke()

      // Parcela
      doc.y += 10
      const col1 = 40, col2 = 210
      doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
      doc.text('PARCELA', col1, doc.y)
      doc.text('DATA DE VENCIMENTO', col2, doc.y)

      doc.y += 14
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827')
      doc.text(`${inst.installment_number}/${inst.installments}`, col1, doc.y)
      doc.text(inst.due_date ? new Date(inst.due_date).toLocaleDateString('pt-BR') : '—', col2, doc.y)

      doc.y += 20
      doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
      doc.text('VALOR PRINCIPAL', col1, doc.y)
      doc.text('JUROS', col2, doc.y)

      doc.y += 14
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827')
      doc.text(fmt(inst.principal_amount), col1, doc.y)
      doc.text(fmt(inst.interest_amount), col2, doc.y)

      if (parseFloat(inst.late_fee_amount) > 0) {
        doc.y += 20
        doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('MORA/JUROS ATRASO', col1, doc.y)
        doc.y += 14
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#dc2626').text(fmt(inst.late_fee_amount), col1, doc.y)
      }

      doc.y += 15
      doc.moveTo(40, doc.y).lineTo(380, doc.y).strokeColor('#e5e7eb').stroke()

      // Valor pago
      doc.y += 10
      doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('VALOR RECEBIDO')
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#16a34a').text(fmt(inst.paid_amount || inst.total_amount))

      if (inst.paid_at) {
        doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
          .text(`Data do pagamento: ${new Date(inst.paid_at).toLocaleDateString('pt-BR')}`)
      }

      // Status
      doc.y += 10
      doc.rect(40, doc.y, 340, 30).fill('#f0fdf4')
      doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(12)
        .text('✓ PAGAMENTO CONFIRMADO', 40, doc.y + 8, { align: 'center', width: 340 })
      doc.y += 40

      // Rodapé
      doc.fillColor('#9ca3af').fontSize(8).font('Helvetica')
        .text('Financeiro MSX — financeiro.msxsystem.site', 40, doc.y + 5, { align: 'center', width: 340 })

      doc.end()
    })

    const buffer = Buffer.concat(chunks)
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="recibo_parcela_${inst.installment_number}.pdf"`)
    return reply.send(buffer)
  })

  // Aplicar mora manualmente em parcelas vencidas
  app.post('/:id/apply-fees', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.id

    const loanRes = await query('SELECT * FROM loans WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, userId])
    if (!loanRes.rows[0]) return reply.code(404).send({ error: 'Empréstimo não encontrado' })

    const loan = loanRes.rows[0]
    const daily = parseFloat(loan.late_fee_rate) || 0
    if (daily <= 0) return { message: 'Valor da mora zerado, nenhuma alteração' }

    const today = new Date().toISOString().split('T')[0]
    const overdueRes = await query(`
      SELECT * FROM loan_installments
      WHERE loan_id = $1 AND NOT paid AND due_date < $2
    `, [id, today])

    for (const inst of overdueRes.rows) {
      const dueStr = inst.due_date instanceof Date
        ? inst.due_date.toISOString().split('T')[0]
        : String(inst.due_date).substring(0, 10)
      const dueDate = new Date(dueStr + 'T12:00:00')
      const todayDate = new Date(today + 'T12:00:00')
      const days = Math.floor((todayDate - dueDate) / (1000 * 60 * 60 * 24))
      if (days <= 0) continue
      const lateFee = daily * days

      await query(`
        UPDATE loan_installments SET late_fee_amount = $1 WHERE id = $2
      `, [lateFee.toFixed(2), inst.id])
    }

    return { message: `Mora aplicada em ${overdueRes.rows.length} parcela(s)` }
  })

  // Enviar cobrança WhatsApp para parcela
  app.post('/installments/:id/notify', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { id } = request.params
    const { custom_message } = request.body

    const instRes = await query(`
      SELECT li.*, l.contact_name, l.contact_phone, l.interest_rate, l.frequency, l.custom_message,
        u.loan_default_message AS user_upcoming_message,
        u.loan_overdue_message AS user_overdue_message
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      JOIN users u ON u.id = li.user_id
      WHERE li.id = $1 AND li.user_id = $2 AND l.deleted_at IS NULL
    `, [id, userId])
    if (!instRes.rows[0]) return reply.code(404).send({ error: 'Parcela não encontrada' })

    const inst = instRes.rows[0]
    if (!inst.contact_phone) return reply.code(400).send({ error: 'Contato sem telefone cadastrado' })

    const settingsRes = await query('SELECT instance_token FROM whatsapp_settings WHERE user_id = $1', [userId])
    const instance_token = settingsRes.rows[0]?.instance_token
    if (!instance_token) return reply.code(400).send({ error: 'WhatsApp não conectado' })

    const total = parseFloat(inst.total_amount) + parseFloat(inst.late_fee_amount || 0)
    const dueDateObj = new Date(String(inst.due_date).substring(0, 10) + 'T12:00:00')
    const dueDate = dueDateObj.toLocaleDateString('pt-BR')
    const now = new Date()
    const todayMidday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)
    const daysLate = Math.max(0, Math.round((todayMidday - dueDateObj) / 86400000))
    const isOverdue = daysLate > 0

    // Prioridade: custom_message (request) > custom_message (empréstimo) > template do usuário > default
    const userTpl = isOverdue ? inst.user_overdue_message : inst.user_upcoming_message
    const fallbackKey = isOverdue ? 'loan_overdue' : 'loan_upcoming'
    const template = custom_message || inst.custom_message || userTpl || MESSAGE_DEFAULTS[fallbackKey]

    const message = interpolate(template, {
      nome: inst.contact_name || '',
      valor: fmtBRL(inst.total_amount),
      vencimento: dueDate,
      parcela: inst.installment_number,
      mora: fmtBRL(inst.late_fee_amount || 0),
      total: fmtBRL(total),
      dias_atraso: daysLate
    })

    const cleanPhone = inst.contact_phone.replace(/\D/g, '')

    try {
      await axios.post(`${UAZAPI_URL}/send/text`, { number: cleanPhone, text: message }, {
        headers: { token: instance_token, 'Content-Type': 'application/json' },
        timeout: 15000
      })
      await query('UPDATE loan_installments SET last_notified_at = NOW() WHERE id = $1', [id])
      await logActivity(userId, 'LOAN_NOTIFY', 'loan', inst.loan_id,
        `Cobrança enviada para ${inst.contact_name} - parcela ${inst.installment_number}`)
      return { success: true, message: 'Cobrança enviada' }
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.response?.data?.error || err.message })
    }
  })

  // Enviar cobrança para todas as parcelas vencidas de um empréstimo
  app.post('/:id/notify-overdue', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { id } = request.params

    const loanRes = await query('SELECT * FROM loans WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, userId])
    if (!loanRes.rows[0]) return reply.code(404).send({ error: 'Empréstimo não encontrado' })
    const loan = loanRes.rows[0]

    if (!loan.contact_phone) return reply.code(400).send({ error: 'Contato sem telefone cadastrado' })

    const settingsRes = await query('SELECT instance_token FROM whatsapp_settings WHERE user_id = $1', [userId])
    const instance_token = settingsRes.rows[0]?.instance_token
    if (!instance_token) return reply.code(400).send({ error: 'WhatsApp não conectado' })

    const today = new Date().toISOString().split('T')[0]
    const overdueRes = await query(`
      SELECT * FROM loan_installments
      WHERE loan_id = $1 AND NOT paid AND due_date < $2
      ORDER BY installment_number
    `, [id, today])

    if (overdueRes.rows.length === 0) return { message: 'Nenhuma parcela vencida' }

    const tplRes = await query('SELECT loan_overdue_multi_message FROM users WHERE id = $1', [userId])
    const userTpl = tplRes.rows[0]?.loan_overdue_multi_message
    const template = userTpl || MESSAGE_DEFAULTS.loan_overdue_multi

    const totalOverdue = overdueRes.rows.reduce((s, i) => s + parseFloat(i.total_amount) + parseFloat(i.late_fee_amount || 0), 0)
    const parcelasLista = overdueRes.rows.map(inst => {
      const dd = new Date(String(inst.due_date).substring(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR')
      const tot = parseFloat(inst.total_amount) + parseFloat(inst.late_fee_amount || 0)
      return `• Parcela ${inst.installment_number} — venc. ${dd} — *${fmtBRL(tot)}*`
    }).join('\n')

    const msg = interpolate(template, {
      nome: loan.contact_name || '',
      parcelas_count: overdueRes.rows.length,
      parcelas_lista: parcelasLista,
      total: fmtBRL(totalOverdue)
    })

    const cleanPhone = loan.contact_phone.replace(/\D/g, '')

    try {
      await axios.post(`${UAZAPI_URL}/send/text`, { number: cleanPhone, text: msg }, {
        headers: { token: instance_token, 'Content-Type': 'application/json' },
        timeout: 15000
      })
      await query('UPDATE loan_installments SET last_notified_at = NOW() WHERE loan_id = $1 AND NOT paid AND due_date < $2', [id, today])
      await logActivity(userId, 'LOAN_NOTIFY_OVERDUE', 'loan', id,
        `Cobrança de atraso enviada para ${loan.contact_name} (${overdueRes.rows.length} parcelas)`)
      return { success: true, message: `Cobrança enviada — ${overdueRes.rows.length} parcela(s)` }
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.response?.data?.error || err.message })
    }
  })
}
