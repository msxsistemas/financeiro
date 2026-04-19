import { query } from '../db/index.js'
import axios from 'axios'
import PDFDocument from 'pdfkit'

const SERVER_URL = process.env.UAZAPI_URL

export default async function delinquentsRoutes(app) {
  // Painel completo de inadimplentes
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id

    // Dívidas vencidas a receber
    const debtsRes = await query(`
      SELECT
        id, description, contact_name, contact_phone,
        amount - paid_amount AS remaining,
        due_date,
        CURRENT_DATE - due_date::date AS days_overdue,
        'debt' AS source,
        status
      FROM debts
      WHERE user_id = $1
        AND type = 'receivable'
        AND status NOT IN ('paid')
        AND due_date < CURRENT_DATE
        AND deleted_at IS NULL
      ORDER BY due_date ASC
    `, [userId])

    // Parcelas de empréstimos vencidas
    const loansRes = await query(`
      SELECT
        li.id, l.contact_name, l.contact_phone,
        li.total_amount + li.late_fee_amount AS remaining,
        li.due_date,
        CURRENT_DATE - li.due_date::date AS days_overdue,
        'loan' AS source,
        li.installment_number,
        l.id AS loan_id,
        l.interest_rate
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      WHERE li.user_id = $1
        AND NOT li.paid
        AND li.due_date < CURRENT_DATE
        AND l.status = 'active'
        AND l.deleted_at IS NULL
      ORDER BY li.due_date ASC
    `, [userId])

    // Resumo por devedor (consolidado)
    const summaryMap = {}

    for (const d of debtsRes.rows) {
      const key = d.contact_phone || d.contact_name || 'sem_contato'
      if (!summaryMap[key]) summaryMap[key] = {
        contact_name: d.contact_name, contact_phone: d.contact_phone,
        total_debt: 0, total_loan: 0, items: [], oldest_due: d.due_date
      }
      summaryMap[key].total_debt += parseFloat(d.remaining)
      summaryMap[key].items.push({ ...d, remaining: parseFloat(d.remaining) })
      if (d.due_date < summaryMap[key].oldest_due) summaryMap[key].oldest_due = d.due_date
    }

    for (const l of loansRes.rows) {
      const key = l.contact_phone || l.contact_name || 'sem_contato'
      if (!summaryMap[key]) summaryMap[key] = {
        contact_name: l.contact_name, contact_phone: l.contact_phone,
        total_debt: 0, total_loan: 0, items: [], oldest_due: l.due_date
      }
      summaryMap[key].total_loan += parseFloat(l.remaining)
      summaryMap[key].items.push({ ...l, remaining: parseFloat(l.remaining) })
      if (l.due_date < summaryMap[key].oldest_due) summaryMap[key].oldest_due = l.due_date
    }

    const summary = Object.values(summaryMap).map(s => ({
      ...s,
      total: s.total_debt + s.total_loan,
      items_count: s.items.length
    })).sort((a, b) => b.total - a.total)

    const grandTotal = summary.reduce((s, r) => s + r.total, 0)

    return {
      summary,
      grand_total: grandTotal,
      debtors_count: summary.length,
      debts_count: debtsRes.rows.length,
      loans_count: loansRes.rows.length
    }
  })

  // Exportar PDF de inadimplentes
  app.get('/pdf', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const userRes = await query('SELECT name FROM users WHERE id = $1', [userId])
    const userName = userRes.rows[0]?.name || ''
    const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

    const debtsRes = await query(`
      SELECT id, description, contact_name, contact_phone,
        amount - paid_amount AS remaining, due_date,
        CURRENT_DATE - due_date::date AS days_overdue, 'debt' AS source, status
      FROM debts WHERE user_id=$1 AND type='receivable' AND status NOT IN ('paid') AND due_date < CURRENT_DATE AND deleted_at IS NULL
      ORDER BY due_date ASC
    `, [userId])

    const loansRes = await query(`
      SELECT li.id, l.contact_name, l.contact_phone,
        li.total_amount + li.late_fee_amount AS remaining, li.due_date,
        CURRENT_DATE - li.due_date::date AS days_overdue, 'loan' AS source, li.installment_number
      FROM loan_installments li JOIN loans l ON l.id = li.loan_id
      WHERE li.user_id=$1 AND NOT li.paid AND li.due_date < CURRENT_DATE AND l.status='active' AND l.deleted_at IS NULL
      ORDER BY li.due_date ASC
    `, [userId])

    const all = [...debtsRes.rows, ...loansRes.rows]
    const grandTotal = all.reduce((s, r) => s + parseFloat(r.remaining), 0)

    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks = []
    doc.on('data', c => chunks.push(c))

    await new Promise(resolve => {
      doc.on('end', resolve)

      // Header
      doc.rect(0, 0, 595, 80).fill('#7c3aed')
      doc.fillColor('white').fontSize(20).font('Helvetica-Bold').text('PAINEL DE INADIMPLENTES', 50, 22)
      doc.fontSize(10).font('Helvetica').text(`${userName} · Gerado em ${new Date().toLocaleString('pt-BR')}`, 50, 52)

      // Resumo
      doc.y = 100
      doc.rect(50, doc.y, 495, 50).fillAndStroke('#fef2f2', '#fca5a5')
      doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(12)
        .text(`Total em Aberto: ${fmt(grandTotal)}`, 60, doc.y + 10)
      doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
        .text(`${debtsRes.rows.length} dívidas · ${loansRes.rows.length} parcelas de empréstimos`, 60, doc.y + 28)

      doc.y += 70

      // Cabeçalho da tabela
      const col = [50, 200, 310, 390, 470]
      doc.rect(50, doc.y, 495, 20).fill('#f3f4f6')
      doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8)
      doc.text('Devedor', col[0] + 3, doc.y + 6)
      doc.text('Descrição / Parcela', col[1] + 3, doc.y + 6)
      doc.text('Vencimento', col[2] + 3, doc.y + 6)
      doc.text('Atraso', col[3] + 3, doc.y + 6)
      doc.text('Valor', col[4] + 3, doc.y + 6)
      doc.y += 22

      // Linhas
      for (let i = 0; i < all.length; i++) {
        const item = all[i]
        if (doc.y > 730) { doc.addPage(); doc.y = 50 }
        const isOdd = i % 2 === 0
        if (isOdd) doc.rect(50, doc.y, 495, 18).fill('#fafafa').stroke('#f3f4f6')
        doc.fillColor('#111827').font('Helvetica').fontSize(8)
        doc.text((item.contact_name || '—').substring(0, 22), col[0] + 3, doc.y + 5, { width: 145 })
        doc.text((item.description || `Parcela ${item.installment_number}` || '—').substring(0, 20), col[1] + 3, doc.y + 5, { width: 105 })
        const dueDate = item.due_date ? new Date(String(item.due_date).substring(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
        doc.text(dueDate, col[2] + 3, doc.y + 5, { width: 75 })
        doc.fillColor('#dc2626').text(`${item.days_overdue || 0}d`, col[3] + 3, doc.y + 5, { width: 75 })
        doc.fillColor('#1d4ed8').font('Helvetica-Bold').text(fmt(item.remaining), col[4] + 3, doc.y + 5, { width: 80 })
        doc.y += 18
      }

      // Rodapé
      doc.moveTo(50, 780).lineTo(545, 780).strokeColor('#e5e7eb').stroke()
      doc.fillColor('#9ca3af').fontSize(8).font('Helvetica')
        .text(`Gerado em ${new Date().toLocaleString('pt-BR')} · Financeiro MSX`, 50, 790, { align: 'center', width: 495 })

      doc.end()
    })

    const buffer = Buffer.concat(chunks)
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="inadimplentes_${new Date().toISOString().split('T')[0]}.pdf"`)
    return reply.send(buffer)
  })

  // Cobrar todos os inadimplentes via WhatsApp
  app.post('/notify-all', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id

    const settingsRes = await query('SELECT instance_token FROM whatsapp_settings WHERE user_id = $1', [userId])
    const instance_token = settingsRes.rows[0]?.instance_token
    if (!instance_token) return reply.code(400).send({ error: 'WhatsApp não conectado' })
    const server_url = SERVER_URL

    // Buscar todos os inadimplentes com telefone
    const debtors = await query(`
      SELECT contact_phone, contact_name,
        SUM(amount - paid_amount) AS total
      FROM debts
      WHERE user_id = $1 AND type = 'receivable'
        AND status NOT IN ('paid') AND due_date < CURRENT_DATE
        AND contact_phone IS NOT NULL AND contact_phone != ''
        AND deleted_at IS NULL
      GROUP BY contact_phone, contact_name
    `, [userId])

    const loanDebtors = await query(`
      SELECT l.contact_phone, l.contact_name,
        SUM(li.total_amount + li.late_fee_amount) AS total
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      WHERE li.user_id = $1 AND NOT li.paid
        AND li.due_date < CURRENT_DATE AND l.status = 'active'
        AND l.contact_phone IS NOT NULL AND l.contact_phone != ''
        AND l.deleted_at IS NULL
      GROUP BY l.contact_phone, l.contact_name
    `, [userId])

    // Consolidar
    const allMap = {}
    for (const r of [...debtors.rows, ...loanDebtors.rows]) {
      const k = r.contact_phone
      if (!allMap[k]) allMap[k] = { phone: k, name: r.contact_name, total: 0 }
      allMap[k].total += parseFloat(r.total)
    }

    const fmt = (v) => `R$ ${parseFloat(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
    let sent = 0
    let errors = 0

    for (const debtor of Object.values(allMap)) {
      const cleanPhone = debtor.phone.replace(/\D/g, '')
      const msg = `Olá ${debtor.name || ''}! ⚠️\n\nVocê possui débitos em aberto totalizando *${fmt(debtor.total)}*.\n\nPor favor entre em contato para regularizar sua situação.\n\n_financeiro.msxsystem.site_`
      try {
        await axios.post(`${server_url}/send/text`, { number: cleanPhone, text: msg }, {
          headers: { token: instance_token }, timeout: 10000
        })
        await query(
          `INSERT INTO whatsapp_log (user_id, phone, contact_name, message, status, source)
           VALUES ($1, $2, $3, $4, 'sent', 'delinquents')`,
          [userId, cleanPhone, debtor.name, msg]
        ).catch(() => {})
        sent++
      } catch {
        await query(
          `INSERT INTO whatsapp_log (user_id, phone, contact_name, message, status, source)
           VALUES ($1, $2, $3, $4, 'failed', 'delinquents')`,
          [userId, debtor.phone, debtor.name, 'Notificação de inadimplência']
        ).catch(() => {})
        errors++
      }
    }

    return { sent, errors, total: Object.keys(allMap).length }
  })
}
