import { query, logActivity } from '../db/index.js'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { generatePixPayload } from '../utils/pix.js'
import { invalidateDashboardCache } from './dashboard.js'

const createDebtSchema = {
  body: {
    type: 'object',
    required: ['description', 'amount', 'type'],
    properties: {
      description: { type: 'string', minLength: 1, maxLength: 500 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      type: { type: 'string', enum: ['payable', 'receivable'] },
      contact_name: { type: ['string', 'null'], maxLength: 200 },
      contact_phone: { type: ['string', 'null'], maxLength: 20 },
      due_date: { type: ['string', 'null'] },
      installments: { type: ['integer', 'null'], minimum: 1, maximum: 360 },
      notes: { type: ['string', 'null'], maxLength: 2000 },
      auto_installments: { type: 'boolean' },
      is_recurring: { type: 'boolean' }
    }
  }
}

// Soma 1 mês a uma data YYYY-MM-DD mantendo o dia (dia 31 em fev vira último dia do mês)
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

const payDebtSchema = {
  body: {
    type: 'object',
    required: ['amount'],
    properties: {
      amount: { type: 'number', exclusiveMinimum: 0 },
      notes: { type: ['string', 'null'], maxLength: 500 }
    }
  }
}

export default async function debtsRoutes(app) {
  // Listar dívidas
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const { type, status, page = 1, limit = 20, search, start_date, end_date } = request.query

    const conditions = ['d.user_id = $1', 'd.deleted_at IS NULL']
    const params = [userId]
    let idx = 2

    if (type) { conditions.push(`d.type = $${idx++}`); params.push(type) }
    if (status) { conditions.push(`d.status = $${idx++}`); params.push(status) }
    if (start_date) { conditions.push(`d.due_date >= $${idx++}`); params.push(start_date) }
    if (end_date) { conditions.push(`d.due_date <= $${idx++}`); params.push(end_date) }
    if (search) {
      conditions.push(`(d.description ILIKE $${idx} OR d.contact_name ILIKE $${idx})`)
      params.push(`%${search}%`)
      idx++
    }

    const safePage = Math.max(1, parseInt(page) || 1)
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20))
    const offset = (safePage - 1) * safeLimit
    const where = conditions.join(' AND ')

    const countRes = await query(`SELECT COUNT(*) FROM debts d WHERE ${where}`, params)
    const total = parseInt(countRes.rows[0].count)

    const result = await query(`
      SELECT d.*,
        CASE WHEN d.due_date < CURRENT_DATE AND d.status NOT IN ('paid') THEN true ELSE false END as is_overdue
      FROM debts d
      WHERE ${where}
      ORDER BY
        CASE WHEN d.due_date < CURRENT_DATE AND d.status != 'paid' THEN 0 ELSE 1 END,
        d.due_date ASC NULLS LAST,
        d.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, safeLimit, offset])

    // Auto-marcar vencidas
    await query(`
      UPDATE debts SET status = 'overdue', updated_at = NOW()
      WHERE user_id = $1 AND due_date < CURRENT_DATE AND status = 'pending' AND deleted_at IS NULL
    `, [userId])

    return {
      data: result.rows,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit)
    }
  })

  // Buscar por ID com pagamentos
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await query(
      'SELECT * FROM debts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [request.params.id, request.user.id]
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })

    const payments = await query(
      'SELECT * FROM debt_payments WHERE debt_id = $1 ORDER BY paid_at DESC',
      [request.params.id]
    )

    return { ...result.rows[0], payments: payments.rows }
  })

  // Criar dívida
  app.post('/', { schema: createDebtSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { description, amount, type, contact_name, contact_phone, due_date, installments, notes, auto_installments, is_recurring } = request.body

    if (!description || !amount || !type) {
      return reply.code(400).send({ error: 'Descrição, valor e tipo são obrigatórios' })
    }

    const numInstallments = parseInt(installments) || 1
    // Recorrência mensal só faz sentido com due_date e sem parcelamento automático
    const recurring = !!is_recurring && !!due_date && !auto_installments
    const nextDate = recurring ? addOneMonth(due_date) : null

    const result = await query(`
      INSERT INTO debts (description, amount, type, contact_name, contact_phone, due_date, installments, notes, user_id, is_recurring, recurrence_next_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [description, amount, type, contact_name || null, contact_phone || null, due_date || null, numInstallments, notes || null, userId, recurring, nextDate])

    const debt = result.rows[0]
    const typeLabel = type === 'payable' ? 'A Pagar' : 'A Receber'
    await logActivity(userId, 'CREATE', 'debt', debt.id, `Dívida ${typeLabel} criada: ${description} - R$ ${amount}`)
    invalidateDashboardCache(userId)

    // Gerar parcelas automaticamente
    if (auto_installments && numInstallments > 1 && due_date) {
      const installmentAmount = (parseFloat(amount) / numInstallments).toFixed(2)
      const firstDate = new Date(due_date)

      for (let i = 1; i <= numInstallments; i++) {
        const dueD = new Date(firstDate)
        dueD.setMonth(dueD.getMonth() + (i - 1))
        const dueDateStr = dueD.toISOString().split('T')[0]

        await query(`
          INSERT INTO debts (description, amount, type, contact_name, contact_phone, due_date,
            installments, notes, user_id, parent_debt_id, installment_number, total_installments)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          `${description} (${i}/${numInstallments})`,
          installmentAmount, type,
          contact_name || null, contact_phone || null,
          dueDateStr, 1, notes || null, userId,
          debt.id, i, numInstallments
        ])
      }
    }

    return reply.code(201).send(debt)
  })

  // Atualizar dívida
  app.put('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { description, amount, type, status, contact_name, contact_phone, due_date, installments, notes, is_recurring } = request.body

    const check = await query('SELECT id, due_date, is_recurring FROM debts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    if (!check.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })

    const cur = check.rows[0]
    const newDue = due_date ?? cur.due_date
    const newDueStr = newDue instanceof Date ? newDue.toISOString().split('T')[0] : (newDue ? String(newDue).substring(0, 10) : null)
    const newRecurring = is_recurring != null ? !!is_recurring : cur.is_recurring
    const nextDate = newRecurring && newDueStr ? addOneMonth(newDueStr) : null

    const result = await query(`
      UPDATE debts SET
        description = $1, amount = $2, type = $3, status = $4,
        contact_name = $5, contact_phone = $6, due_date = $7,
        installments = $8, notes = $9,
        is_recurring = $10, recurrence_next_date = $11,
        updated_at = NOW()
      WHERE id = $12 AND user_id = $13 AND deleted_at IS NULL
      RETURNING *
    `, [description, amount, type, status, contact_name || null, contact_phone || null, due_date || null, installments || 1, notes || null, newRecurring, nextDate, request.params.id, userId])

    await logActivity(userId, 'UPDATE', 'debt', request.params.id, `Dívida atualizada: ${description}`)
    invalidateDashboardCache(userId)
    return result.rows[0]
  })

  // Registrar pagamento
  app.post('/:id/pay', { schema: payDebtSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { amount, notes } = request.body

    if (!amount || amount <= 0) {
      return reply.code(400).send({ error: 'Valor do pagamento inválido' })
    }

    const debtRes = await query('SELECT * FROM debts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    if (!debtRes.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })

    const debt = debtRes.rows[0]
    const newPaidAmount = parseFloat(debt.paid_amount) + parseFloat(amount)
    const remaining = parseFloat(debt.amount) - newPaidAmount

    let newStatus = 'partial'
    if (remaining <= 0) newStatus = 'paid'

    // Registrar pagamento
    await query(
      'INSERT INTO debt_payments (debt_id, amount, notes, user_id) VALUES ($1, $2, $3, $4)',
      [request.params.id, amount, notes || null, userId]
    )

    // Atualizar dívida
    const result = await query(`
      UPDATE debts SET paid_amount = $1, status = $2, updated_at = NOW()
      WHERE id = $3 AND deleted_at IS NULL RETURNING *
    `, [newPaidAmount, newStatus, request.params.id])

    await logActivity(userId, 'PAYMENT', 'debt', request.params.id,
      `Pagamento de R$ ${amount} registrado para: ${debt.description}`)
    invalidateDashboardCache(userId)

    return result.rows[0]
  })

  // Deletar dívida
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const check = await query('SELECT id FROM debts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    if (!check.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })

    await query('UPDATE debts SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    await logActivity(userId, 'DELETE', 'debt', request.params.id, 'Dívida removida')
    invalidateDashboardCache(userId)

    return { message: 'Removido com sucesso' }
  })

  // Export CSV
  app.get('/export/csv', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { type, status } = request.query

    const conditions = ['user_id = $1', 'deleted_at IS NULL']
    const params = [userId]
    let idx = 2

    if (type) { conditions.push(`type = $${idx++}`); params.push(type) }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status) }

    const result = await query(`
      SELECT description, type, amount, paid_amount, status, contact_name, contact_phone,
        due_date, installments, notes, created_at
      FROM debts WHERE ${conditions.join(' AND ')}
      ORDER BY due_date ASC
    `, params)

    const header = 'Descricao,Tipo,Valor Total,Valor Pago,Restante,Status,Contato,Telefone,Vencimento,Parcelas,Observacoes\n'
    const rows = result.rows.map(r => {
      const remaining = parseFloat(r.amount) - parseFloat(r.paid_amount || 0)
      return `"${r.description}","${r.type === 'payable' ? 'A Pagar' : 'A Receber'}","${parseFloat(r.amount).toFixed(2)}","${parseFloat(r.paid_amount || 0).toFixed(2)}","${remaining.toFixed(2)}","${r.status}","${r.contact_name || ''}","${r.contact_phone || ''}","${r.due_date ? new Date(r.due_date).toLocaleDateString('pt-BR') : ''}","${r.installments || 1}","${r.notes || ''}"`
    }).join('\n')

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="dividas_${new Date().toISOString().split('T')[0]}.csv"`)
    return reply.send('\uFEFF' + header + rows)
  })

  // PDF de cobrança
  app.get('/:id/pdf', { preHandler: [app.authenticate] }, async (request, reply) => {
    const debtRes = await query('SELECT * FROM debts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, request.user.id])
    if (!debtRes.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })

    const debt = debtRes.rows[0]
    const userRes = await query('SELECT name, pix_key, pix_key_type FROM users WHERE id = $1', [request.user.id])
    const user = userRes.rows[0]

    // Pre-generate PIX QR code buffer if user has pix_key
    let qrBuffer = null
    if (user.pix_key) {
      try {
        const remaining = parseFloat(debt.amount) - parseFloat(debt.paid_amount || 0)
        const pixPayload = generatePixPayload(
          user.pix_key,
          user.name || 'Recebedor',
          'Brasil',
          remaining > 0 ? remaining : null,
          `DIV${debt.id.substring(0, 10)}`
        )
        qrBuffer = await QRCode.toBuffer(pixPayload, { width: 100, margin: 1 })
      } catch {}
    }

    const doc = new PDFDocument({ size: 'A4', margin: 60 })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))

    await new Promise(resolve => {
      doc.on('end', resolve)

      // Header
      doc.rect(0, 0, 595, 100).fill('#4f46e5')
      doc.fillColor('white').fontSize(28).font('Helvetica-Bold')
      doc.text('COBRANÇA', 60, 35, { align: 'left' })
      doc.fontSize(12).font('Helvetica').text(user.name || '', 60, 70)

      doc.fillColor('#111827').font('Helvetica')

      // Data
      const now = new Date().toLocaleDateString('pt-BR')
      doc.fontSize(10).text(`Emitido em: ${now}`, 400, 115, { align: 'right', width: 135 })

      // Linha divisória
      doc.moveTo(60, 130).lineTo(535, 130).strokeColor('#e5e7eb').stroke()

      // Seção descrição
      doc.y = 150
      doc.fontSize(11).fillColor('#6b7280').text('DESCRIÇÃO', 60)
      doc.fontSize(16).fillColor('#111827').font('Helvetica-Bold')
        .text(debt.description, 60, doc.y + 5)

      doc.y += 10
      doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor('#e5e7eb').stroke()

      // Valores
      doc.y += 15
      const remaining = parseFloat(debt.amount) - parseFloat(debt.paid_amount || 0)
      const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

      const col1 = 60, col2 = 200, col3 = 350
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280')
      doc.text('Valor Total', col1, doc.y)
      doc.text('Valor Pago', col2, doc.y)
      doc.text('Saldo Devedor', col3, doc.y)

      doc.y += 18
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827')
      doc.text(fmt(debt.amount), col1, doc.y)
      doc.fillColor('#16a34a').text(fmt(debt.paid_amount || 0), col2, doc.y)
      doc.fillColor('#dc2626').fontSize(16).text(fmt(remaining), col3, doc.y)

      doc.y += 30
      doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor('#e5e7eb').stroke()

      // Detalhes
      doc.y += 15
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280')

      if (debt.contact_name) {
        doc.text(`Devedor: `, col1, doc.y, { continued: true })
        doc.fillColor('#111827').font('Helvetica-Bold').text(debt.contact_name)
        doc.font('Helvetica').fillColor('#6b7280')
      }
      if (debt.contact_phone) {
        doc.text(`WhatsApp: `, col1, doc.y, { continued: true })
        doc.fillColor('#111827').font('Helvetica-Bold').text(debt.contact_phone)
        doc.font('Helvetica').fillColor('#6b7280')
      }
      if (debt.due_date) {
        doc.text(`Vencimento: `, col1, doc.y, { continued: true })
        const dueColor = new Date(debt.due_date) < new Date() && debt.status !== 'paid' ? '#dc2626' : '#111827'
        doc.fillColor(dueColor).font('Helvetica-Bold')
          .text(new Date(debt.due_date).toLocaleDateString('pt-BR'))
        doc.font('Helvetica').fillColor('#6b7280')
      }

      const statusMap = { pending: 'Pendente', partial: 'Parcial', paid: 'Pago', overdue: 'Vencido' }
      doc.text(`Status: `, col1, doc.y, { continued: true })
      doc.fillColor('#111827').font('Helvetica-Bold').text(statusMap[debt.status] || debt.status)

      if (debt.installments > 1) {
        doc.font('Helvetica').fillColor('#6b7280')
        doc.text(`Parcelas: `, col1, doc.y, { continued: true })
        doc.fillColor('#111827').font('Helvetica-Bold').text(`${debt.installments}x`)
      }

      // Chave PIX + QR Code
      if (user.pix_key) {
        doc.y += 10
        doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor('#e5e7eb').stroke()
        doc.y += 15

        const boxHeight = qrBuffer ? 110 : 65
        doc.rect(60, doc.y, 475, boxHeight).fillAndStroke('#f0fdf4', '#16a34a')
        doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(11)
          .text('Pagamento via PIX', 75, doc.y + 10)
        doc.fillColor('#166534').font('Helvetica').fontSize(10)
          .text(`${user.pix_key_type ? user.pix_key_type.toUpperCase() + ': ' : ''}${user.pix_key}`, 75, doc.y + 28)

        if (qrBuffer) {
          doc.image(qrBuffer, 380, doc.y - 28, { width: 95, height: 95 })
          doc.fillColor('#15803d').font('Helvetica').fontSize(8)
            .text('Escaneie para pagar', 380, doc.y + 68, { width: 95, align: 'center' })
        }

        doc.y += boxHeight + 5
      }

      // Observações
      if (debt.notes) {
        doc.y += 10
        doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('Observações:')
        doc.fillColor('#374151').text(debt.notes, { width: 475 })
      }

      // Rodapé
      doc.rect(0, 750, 595, 92).fill('#f9fafb')
      doc.fillColor('#9ca3af').fontSize(9).font('Helvetica')
        .text('Documento gerado pelo sistema Financeiro MSX', 60, 765, { align: 'center', width: 475 })

      doc.end()
    })

    const buffer = Buffer.concat(chunks)
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="cobranca_${debt.id}.pdf"`)
    return reply.send(buffer)
  })

  // Resumo
  app.get('/stats/summary', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id

    const result = await query(`
      SELECT
        type,
        status,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(paid_amount), 0) as total_paid,
        COALESCE(SUM(amount - paid_amount), 0) as total_remaining
      FROM debts
      WHERE user_id = $1 AND deleted_at IS NULL
      GROUP BY type, status
    `, [userId])

    return result.rows
  })
}
