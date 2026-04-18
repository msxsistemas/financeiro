import { query } from '../db/index.js'

const fmt = (v) => `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`

export default async function notificationsRoutes(app) {
  // Buscar todas as notificações/alertas ativos
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const alerts = []

    // Dívidas vencidas
    const overdueDebts = await query(`
      SELECT id, description, type, amount - paid_amount as remaining, due_date, contact_name
      FROM debts
      WHERE user_id = $1 AND status != 'paid' AND due_date < CURRENT_DATE
      ORDER BY due_date ASC
      LIMIT 10
    `, [userId])

    overdueDebts.rows.forEach(d => {
      alerts.push({
        id: `debt_overdue_${d.id}`,
        type: 'danger',
        category: 'debt',
        entity_id: d.id,
        title: 'Dívida vencida',
        message: `${d.description} - R$ ${parseFloat(d.remaining).toFixed(2).replace('.', ',')} (venceu ${new Date(d.due_date).toLocaleDateString('pt-BR')})`,
        action_url: '/debts'
      })
    })

    // Dívidas vencendo nos próximos 3 dias
    const dueSoon = await query(`
      SELECT id, description, type, amount - paid_amount as remaining, due_date
      FROM debts
      WHERE user_id = $1 AND status NOT IN ('paid', 'overdue')
        AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
      ORDER BY due_date ASC
      LIMIT 5
    `, [userId])

    dueSoon.rows.forEach(d => {
      const daysLeft = Math.ceil((new Date(d.due_date) - new Date()) / (1000 * 60 * 60 * 24))
      alerts.push({
        id: `debt_due_${d.id}`,
        type: 'warning',
        category: 'debt',
        entity_id: d.id,
        title: 'Dívida vence em breve',
        message: `${d.description} vence ${daysLeft === 0 ? 'hoje' : `em ${daysLeft} dia(s)`} - R$ ${parseFloat(d.remaining).toFixed(2).replace('.', ',')}`,
        action_url: '/debts'
      })
    })

    // Produtos com estoque baixo
    const lowStock = await query(`
      SELECT id, name, stock_quantity, min_stock, unit
      FROM products
      WHERE user_id = $1 AND active = true AND stock_quantity <= min_stock AND min_stock > 0
      ORDER BY stock_quantity ASC
      LIMIT 5
    `, [userId])

    lowStock.rows.forEach(p => {
      alerts.push({
        id: `stock_low_${p.id}`,
        type: 'warning',
        category: 'product',
        entity_id: p.id,
        title: 'Estoque baixo',
        message: `${p.name}: ${p.stock_quantity} ${p.unit} (mínimo: ${p.min_stock})`,
        action_url: '/products'
      })
    })

    // Eventos de hoje
    const todayEvents = await query(`
      SELECT id, title, start_date
      FROM calendar_events
      WHERE user_id = $1
        AND DATE(start_date) = CURRENT_DATE
        AND start_date > NOW()
      ORDER BY start_date ASC
      LIMIT 5
    `, [userId])

    todayEvents.rows.forEach(e => {
      alerts.push({
        id: `event_today_${e.id}`,
        type: 'info',
        category: 'calendar',
        entity_id: e.id,
        title: 'Evento hoje',
        message: `${e.title} às ${new Date(e.start_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        action_url: '/calendar'
      })
    })

    // Transações pendentes vencidas
    const pendingTx = await query(`
      SELECT COUNT(*) as count, SUM(amount) as total
      FROM transactions
      WHERE user_id = $1 AND status = 'pending'
        AND due_date < CURRENT_DATE AND type = 'expense'
    `, [userId])

    if (parseInt(pendingTx.rows[0].count) > 0) {
      alerts.push({
        id: 'pending_expenses',
        type: 'info',
        category: 'transaction',
        title: 'Despesas pendentes',
        message: `${pendingTx.rows[0].count} despesas pendentes vencidas totalizando R$ ${parseFloat(pendingTx.rows[0].total || 0).toFixed(2).replace('.', ',')}`,
        action_url: '/transactions'
      })
    }

    // Parcelas de empréstimo vencidas
    const overdueLoans = await query(`
      SELECT li.id, li.installment_number, li.due_date,
        li.total_amount + li.late_fee_amount as total,
        l.contact_name, l.id as loan_id
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      WHERE li.user_id = $1 AND NOT li.paid
        AND li.due_date < CURRENT_DATE
        AND l.status = 'active'
      ORDER BY li.due_date ASC
      LIMIT 10
    `, [userId])

    if (overdueLoans.rows.length > 0) {
      const total = overdueLoans.rows.reduce((s, r) => s + parseFloat(r.total), 0)
      alerts.push({
        id: 'loans_overdue',
        type: 'danger',
        category: 'loan',
        entity_id: overdueLoans.rows[0].loan_id,
        title: 'Parcelas vencidas',
        message: `${overdueLoans.rows.length} parcela(s) de empréstimo em atraso — R$ ${total.toFixed(2).replace('.', ',')}`,
        action_url: '/loans'
      })
    }

    // Parcelas de empréstimo vencendo em 2 dias
    const dueSoonLoans = await query(`
      SELECT li.id, li.installment_number, li.due_date, li.total_amount, l.contact_name
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      WHERE li.user_id = $1 AND NOT li.paid
        AND li.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '2 days'
        AND l.status = 'active'
      ORDER BY li.due_date ASC
      LIMIT 5
    `, [userId])

    dueSoonLoans.rows.forEach(inst => {
      const daysLeft = Math.ceil((new Date(inst.due_date) - new Date()) / (1000 * 60 * 60 * 24))
      alerts.push({
        id: `loan_due_${inst.id}`,
        type: 'warning',
        category: 'loan',
        entity_id: inst.id,
        title: 'Parcela vence em breve',
        message: `${inst.contact_name} — parcela ${inst.installment_number} vence ${daysLeft === 0 ? 'hoje' : `em ${daysLeft} dia(s)`} — R$ ${parseFloat(inst.total_amount).toFixed(2).replace('.', ',')}`,
        action_url: '/loans'
      })
    })

    // Metas de orçamento ultrapassadas
    const now2 = new Date()
    const budgetM = now2.getMonth() + 1
    const budgetY = now2.getFullYear()
    const bStart = `${budgetY}-${String(budgetM).padStart(2, '0')}-01`
    const bEnd = new Date(budgetY, budgetM, 0).toISOString().split('T')[0]
    const overspentBudgets = await query(`
      SELECT b.amount as budget, c.name as category,
        COALESCE(SUM(t.amount), 0) as spent
      FROM budgets b
      JOIN categories c ON b.category_id = c.id
      LEFT JOIN transactions t ON t.category_id = c.id
        AND t.type = 'expense' AND t.status = 'completed'
        AND t.paid_date BETWEEN $2 AND $3 AND t.user_id = $1
      WHERE b.user_id = $1 AND b.month = $4 AND b.year = $5
      GROUP BY b.amount, c.name
      HAVING COALESCE(SUM(t.amount), 0) >= b.amount * 0.9
    `, [userId, bStart, bEnd, budgetM, budgetY])

    overspentBudgets.rows.forEach(b => {
      const pct = parseFloat(b.budget) > 0 ? (parseFloat(b.spent) / parseFloat(b.budget) * 100) : 0
      const isOver = parseFloat(b.spent) >= parseFloat(b.budget)
      alerts.push({
        id: `budget_${b.category}`,
        type: isOver ? 'danger' : 'warning',
        category: 'budget',
        title: isOver ? 'Orçamento excedido' : 'Orçamento quase esgotado',
        message: `${b.category}: ${fmt(parseFloat(b.spent))} de ${fmt(parseFloat(b.budget))} (${pct.toFixed(0)}%)`,
        action_url: '/reports'
      })
    })

    // Meta de receita mensal: alerta se >50% do mês passou e <50% da meta atingida
    const goalRes = await query(
      'SELECT target_income FROM monthly_income_goals WHERE user_id=$1 AND month=$2 AND year=$3',
      [userId, budgetM, budgetY]
    )
    if (goalRes.rows[0]?.target_income) {
      const target = parseFloat(goalRes.rows[0].target_income)
      const actualIncomeRes = await query(
        'SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE user_id=$1 AND type=\'income\' AND status=\'completed\' AND paid_date BETWEEN $2 AND $3',
        [userId, bStart, bEnd]
      )
      const actual = parseFloat(actualIncomeRes.rows[0].total || 0)
      const dayOfMonth = now2.getDate()
      const daysInMonth = new Date(budgetY, budgetM, 0).getDate()
      const monthPct = dayOfMonth / daysInMonth
      const goalPct = target > 0 ? actual / target : 0
      if (monthPct >= 0.5 && goalPct < 0.5) {
        alerts.push({
          id: 'income_goal_warning',
          type: 'warning',
          category: 'goal',
          title: 'Meta de receita em risco',
          message: `Apenas ${(goalPct * 100).toFixed(0)}% da meta atingida com ${(monthPct * 100).toFixed(0)}% do mês decorrido`,
          action_url: '/reports'
        })
      }
    }

    // Receitas pendentes vencidas
    const pendingIncome = await query(`
      SELECT COUNT(*) as count, SUM(amount) as total
      FROM transactions WHERE user_id=$1 AND status='pending' AND due_date < CURRENT_DATE AND type='income'
    `, [userId])
    if (parseInt(pendingIncome.rows[0].count) > 0) {
      alerts.push({
        id: 'pending_incomes',
        type: 'info',
        category: 'transaction',
        title: 'Receitas pendentes vencidas',
        message: `${pendingIncome.rows[0].count} receitas pendentes vencidas — ${fmt(parseFloat(pendingIncome.rows[0].total || 0))}`,
        action_url: '/transactions'
      })
    }

    // Ordernar: danger > warning > info
    const order = { danger: 0, warning: 1, info: 2 }
    alerts.sort((a, b) => order[a.type] - order[b.type])

    return {
      total: alerts.length,
      has_danger: alerts.some(a => a.type === 'danger'),
      alerts
    }
  })
}
