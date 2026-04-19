import { query } from '../db/index.js'
import PDFDocument from 'pdfkit'

export default async function reportsRoutes(app) {

  // Export CSV consolidado (transações + dívidas + empréstimos) do período
  app.get('/export/consolidated', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { start_date, end_date } = request.query
    const s = start_date || '1900-01-01'
    const e = end_date || '9999-12-31'

    const tx = await query(`
      SELECT 'transaction' AS origem, t.id::text AS id, t.description, t.type,
        t.amount, COALESCE(c.name,'') AS categoria, COALESCE(t.status,'') AS status,
        t.due_date, t.paid_date, COALESCE(t.cost_center,'') AS cost_center
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = $1 AND COALESCE(t.paid_date, t.due_date) BETWEEN $2 AND $3 AND t.deleted_at IS NULL
    `, [userId, s, e])

    const dbs = await query(`
      SELECT 'debt' AS origem, id::text, description, type,
        amount, '' AS categoria, status, due_date, NULL AS paid_date, '' AS cost_center
      FROM debts
      WHERE user_id = $1 AND due_date BETWEEN $2 AND $3 AND deleted_at IS NULL
    `, [userId, s, e])

    const loans = await query(`
      SELECT 'loan_installment' AS origem, li.id::text,
        ('Parcela ' || li.installment_number || ' de ' || COALESCE(l.contact_name,'-')) AS description,
        CASE WHEN li.paid THEN 'paid' ELSE 'pending' END AS type,
        li.total_amount AS amount, '' AS categoria,
        CASE WHEN li.paid THEN 'paid' ELSE 'pending' END AS status,
        li.due_date, li.paid_at AS paid_date, '' AS cost_center
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      WHERE li.user_id = $1 AND li.due_date BETWEEN $2 AND $3 AND l.deleted_at IS NULL
    `, [userId, s, e])

    const all = [...tx.rows, ...dbs.rows, ...loans.rows]
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))

    const header = ['Origem', 'ID', 'Descrição', 'Tipo', 'Valor', 'Categoria', 'Status', 'Vencimento', 'Pagamento', 'Centro de Custo']
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = all.map(r => [
      r.origem, r.id, r.description, r.type, parseFloat(r.amount).toFixed(2),
      r.categoria, r.status,
      r.due_date ? String(r.due_date).substring(0, 10) : '',
      r.paid_date ? String(r.paid_date).substring(0, 10) : '',
      r.cost_center
    ].map(escape).join(','))
    const csv = '\uFEFF' + [header.map(escape).join(','), ...rows].join('\n')

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="financeiro_${s}_${e}.csv"`)
    return csv
  })

  // DRE - Demonstração de Resultados do Mês
  app.get('/dre', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const { month, year } = request.query
    const now = new Date()
    const m = parseInt(month || now.getMonth() + 1)
    const y = parseInt(year || now.getFullYear())
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end = new Date(y, m, 0).toISOString().split('T')[0]

    // Receitas por categoria
    const incomeRes = await query(`
      SELECT
        COALESCE(c.name, 'Sem categoria') as category,
        COALESCE(c.color, '#22c55e') as color,
        SUM(t.amount) as total,
        COUNT(*) as count
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'income' AND t.status = 'completed'
        AND t.paid_date BETWEEN $2 AND $3 AND t.deleted_at IS NULL
      GROUP BY c.name, c.color
      ORDER BY total DESC
    `, [userId, start, end])

    // Despesas por categoria
    const expenseRes = await query(`
      SELECT
        COALESCE(c.name, 'Sem categoria') as category,
        COALESCE(c.color, '#ef4444') as color,
        SUM(t.amount) as total,
        COUNT(*) as count
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'expense' AND t.status = 'completed'
        AND t.paid_date BETWEEN $2 AND $3 AND t.deleted_at IS NULL
      GROUP BY c.name, c.color
      ORDER BY total DESC
    `, [userId, start, end])

    const totalIncome = incomeRes.rows.reduce((s, r) => s + parseFloat(r.total), 0)
    const totalExpense = expenseRes.rows.reduce((s, r) => s + parseFloat(r.total), 0)

    // Mês anterior para comparação
    const prevDate = new Date(y, m - 2, 1)
    const prevM = prevDate.getMonth() + 1
    const prevY = prevDate.getFullYear()
    const prevStart = `${prevY}-${String(prevM).padStart(2, '0')}-01`
    const prevEnd = new Date(prevY, prevM, 0).toISOString().split('T')[0]

    const [prevIncomeRes, prevExpenseRes] = await Promise.all([
      query(`SELECT COALESCE(c.name,'Sem categoria') as category, SUM(t.amount) as total
        FROM transactions t LEFT JOIN categories c ON t.category_id=c.id
        WHERE t.user_id=$1 AND t.type='income' AND t.status='completed' AND t.paid_date BETWEEN $2 AND $3 AND t.deleted_at IS NULL
        GROUP BY c.name`, [userId, prevStart, prevEnd]),
      query(`SELECT COALESCE(c.name,'Sem categoria') as category, SUM(t.amount) as total
        FROM transactions t LEFT JOIN categories c ON t.category_id=c.id
        WHERE t.user_id=$1 AND t.type='expense' AND t.status='completed' AND t.paid_date BETWEEN $2 AND $3 AND t.deleted_at IS NULL
        GROUP BY c.name`, [userId, prevStart, prevEnd])
    ])
    const prevIncomeMap = {}; prevIncomeRes.rows.forEach(r => { prevIncomeMap[r.category] = parseFloat(r.total) })
    const prevExpenseMap = {}; prevExpenseRes.rows.forEach(r => { prevExpenseMap[r.category] = parseFloat(r.total) })
    const prevTotalIncome = prevIncomeRes.rows.reduce((s, r) => s + parseFloat(r.total), 0)
    const prevTotalExpense = prevExpenseRes.rows.reduce((s, r) => s + parseFloat(r.total), 0)

    // Metas do mês
    const budgetsRes = await query(`
      SELECT b.amount as budget, c.name as category, c.id as category_id,
        COALESCE(SUM(t.amount), 0) as spent
      FROM budgets b
      JOIN categories c ON b.category_id = c.id
      LEFT JOIN transactions t ON t.category_id = c.id
        AND t.type = 'expense' AND t.status = 'completed'
        AND t.paid_date BETWEEN $2 AND $3 AND t.user_id = $1
        AND t.deleted_at IS NULL
      WHERE b.user_id = $1 AND b.month = $4 AND b.year = $5
      GROUP BY b.amount, c.name, c.id
    `, [userId, start, end, m, y])

    return {
      period: { month: m, year: y, start, end },
      prev_period: { month: prevM, year: prevY },
      income: {
        total: totalIncome,
        prev_total: prevTotalIncome,
        breakdown: incomeRes.rows.map(r => ({
          ...r, total: parseFloat(r.total),
          pct: totalIncome > 0 ? (parseFloat(r.total) / totalIncome * 100) : 0,
          prev_total: prevIncomeMap[r.category] || 0
        }))
      },
      expense: {
        total: totalExpense,
        prev_total: prevTotalExpense,
        breakdown: expenseRes.rows.map(r => ({
          ...r, total: parseFloat(r.total),
          pct: totalExpense > 0 ? (parseFloat(r.total) / totalExpense * 100) : 0,
          prev_total: prevExpenseMap[r.category] || 0
        }))
      },
      result: totalIncome - totalExpense,
      prev_result: prevTotalIncome - prevTotalExpense,
      margin: totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0,
      budgets: budgetsRes.rows.map(b => ({
        ...b,
        budget: parseFloat(b.budget),
        spent: parseFloat(b.spent),
        remaining: parseFloat(b.budget) - parseFloat(b.spent),
        pct: parseFloat(b.budget) > 0 ? (parseFloat(b.spent) / parseFloat(b.budget) * 100) : 0
      }))
    }
  })

  // Resumo Anual - mês a mês
  app.get('/annual', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const year = parseInt(request.query.year || new Date().getFullYear())

    const result = await query(`
      SELECT
        EXTRACT(MONTH FROM COALESCE(paid_date, due_date, created_at::date)) as month,
        type,
        SUM(amount) as total,
        COUNT(*) as count
      FROM transactions
      WHERE user_id = $1 AND status = 'completed'
        AND EXTRACT(YEAR FROM COALESCE(paid_date, due_date, created_at::date)) = $2
        AND deleted_at IS NULL
      GROUP BY 1, 2
      ORDER BY 1
    `, [userId, year])

    const months = Array.from({ length: 12 }, (_, i) => {
      const mo = i + 1
      const inc = result.rows.find(r => parseInt(r.month) === mo && r.type === 'income')
      const exp = result.rows.find(r => parseInt(r.month) === mo && r.type === 'expense')
      const income = parseFloat(inc?.total || 0)
      const expense = parseFloat(exp?.total || 0)
      return {
        month: mo,
        month_name: new Date(year, i, 1).toLocaleString('pt-BR', { month: 'short' }),
        income,
        expense,
        balance: income - expense,
        income_count: parseInt(inc?.count || 0),
        expense_count: parseInt(exp?.count || 0)
      }
    })

    const totals = months.reduce((acc, m) => ({
      income: acc.income + m.income,
      expense: acc.expense + m.expense,
      balance: acc.balance + m.balance
    }), { income: 0, expense: 0, balance: 0 })

    return { year, months, totals }
  })

  // Fluxo de caixa - próximos 60 dias
  app.get('/cashflow', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const days = Math.max(1, Math.min(365, parseInt(request.query.days || 60) || 60))
    const accountId = request.query.account_id || null

    const accountFilter = accountId ? 'AND account_id = $2' : ''
    const baseParams = accountId ? [userId, accountId] : [userId]

    const result = await query(`
      SELECT
        TO_CHAR(COALESCE(due_date, created_at::date), 'YYYY-MM-DD') as date,
        type,
        status,
        SUM(amount) as total,
        COUNT(*) as count,
        array_agg(description) as descriptions
      FROM transactions
      WHERE user_id = $1
        ${accountFilter}
        AND status IN ('pending', 'completed')
        AND COALESCE(due_date, created_at::date) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${days} days'
        AND deleted_at IS NULL
      GROUP BY 1, 2, 3
      ORDER BY 1
    `, baseParams)

    // Saldo atual (transações concluídas até hoje)
    const balanceRes = await query(`
      SELECT
        SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as balance
      FROM transactions
      WHERE user_id = $1 AND status = 'completed'
        ${accountFilter}
        AND COALESCE(paid_date, due_date) < CURRENT_DATE
        AND deleted_at IS NULL
    `, baseParams)

    let runningBalance = parseFloat(balanceRes.rows[0]?.balance || 0)
    let runningActual = runningBalance

    // Montar timeline dia a dia
    const timeline = []
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    for (let d = 0; d < days; d++) {
      const date = new Date(today)
      date.setDate(date.getDate() + d)
      const dateStr = date.toISOString().split('T')[0]

      const incAll = result.rows.filter(r => r.date === dateStr && r.type === 'income')
      const expAll = result.rows.filter(r => r.date === dateStr && r.type === 'expense')
      const incCompleted = incAll.filter(r => r.status === 'completed')
      const expCompleted = expAll.filter(r => r.status === 'completed')

      const income = incAll.reduce((s, r) => s + parseFloat(r.total), 0)
      const expense = expAll.reduce((s, r) => s + parseFloat(r.total), 0)
      const incomeActual = incCompleted.reduce((s, r) => s + parseFloat(r.total), 0)
      const expenseActual = expCompleted.reduce((s, r) => s + parseFloat(r.total), 0)

      runningBalance += income - expense
      runningActual += incomeActual - expenseActual

      if (income > 0 || expense > 0) {
        const allDescs = [...incAll, ...expAll].flatMap(r => r.descriptions)
        timeline.push({
          date: dateStr,
          income,
          expense,
          balance: runningBalance,
          actual_balance: dateStr <= todayStr ? runningActual : null,
          income_items: incAll.flatMap(r => r.descriptions) || [],
          expense_items: expAll.flatMap(r => r.descriptions) || []
        })
      }
    }

    return {
      current_balance: parseFloat(balanceRes.rows[0]?.balance || 0),
      projected_balance: runningBalance,
      days,
      timeline
    }
  })

  // Comparativo de períodos
  app.get('/compare', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const now = new Date()

    // Últimos 6 meses com detalhes
    const result = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', COALESCE(paid_date, due_date, created_at::date)), 'YYYY-MM') as period,
        type,
        COUNT(*) as count,
        SUM(amount) as total,
        AVG(amount) as avg,
        MAX(amount) as max_amount
      FROM transactions
      WHERE user_id = $1 AND status = 'completed'
        AND COALESCE(paid_date, due_date, created_at::date) >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
        AND deleted_at IS NULL
      GROUP BY 1, 2
      ORDER BY 1
    `, [userId])

    return result.rows.map(r => ({
      ...r,
      total: parseFloat(r.total),
      avg: parseFloat(r.avg),
      max_amount: parseFloat(r.max_amount),
      count: parseInt(r.count)
    }))
  })

  // Metas - CRUD
  app.get('/budgets', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const { month, year } = request.query
    const now = new Date()
    const m = parseInt(month || now.getMonth() + 1)
    const y = parseInt(year || now.getFullYear())
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end = new Date(y, m, 0).toISOString().split('T')[0]

    const result = await query(`
      SELECT b.*, c.name as category_name, c.color,
        COALESCE(SUM(t.amount), 0) as spent
      FROM budgets b
      JOIN categories c ON b.category_id = c.id
      LEFT JOIN transactions t ON t.category_id = c.id
        AND t.type = 'expense' AND t.status = 'completed'
        AND t.paid_date BETWEEN $2 AND $3 AND t.user_id = $1
        AND t.deleted_at IS NULL
      WHERE b.user_id = $1 AND b.month = $4 AND b.year = $5
      GROUP BY b.id, c.name, c.color
    `, [userId, start, end, m, y])

    return result.rows.map(r => ({
      ...r,
      amount: parseFloat(r.amount),
      spent: parseFloat(r.spent),
      remaining: parseFloat(r.amount) - parseFloat(r.spent),
      pct: parseFloat(r.amount) > 0 ? Math.min(100, parseFloat(r.spent) / parseFloat(r.amount) * 100) : 0
    }))
  })

  app.post('/budgets', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { category_id, month, year, amount } = request.body
    if (!category_id || !month || !year || !amount) return reply.code(400).send({ error: 'Campos obrigatórios ausentes' })

    const result = await query(`
      INSERT INTO budgets (category_id, month, year, amount, user_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (category_id, month, year, user_id) DO UPDATE SET amount = $4
      RETURNING *
    `, [category_id, month, year, amount, userId])

    return reply.code(201).send(result.rows[0])
  })

  app.put('/budgets/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { amount } = request.body
    if (!amount || parseFloat(amount) <= 0) return reply.code(400).send({ error: 'Valor inválido' })

    const result = await query(
      'UPDATE budgets SET amount = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [amount, request.params.id, userId]
    )
    if (!result.rows[0]) return reply.code(404).send({ error: 'Meta não encontrada' })
    return result.rows[0]
  })

  app.delete('/budgets/:id', { preHandler: [app.authenticate] }, async (request) => {
    await query('DELETE FROM budgets WHERE id = $1 AND user_id = $2', [request.params.id, request.user.id])
    return { message: 'Removido' }
  })

  // Gráfico de patrimônio (saldo acumulado mês a mês)
  app.get('/patrimony', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const months = Math.max(1, Math.min(24, parseInt(request.query.months || 12) || 12))

    const result = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', COALESCE(paid_date, due_date, created_at::date)), 'YYYY-MM') as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
      FROM transactions
      WHERE user_id = $1 AND status = 'completed'
        AND COALESCE(paid_date, due_date, created_at::date) >=
          DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '${months - 1} months'
        AND deleted_at IS NULL
      GROUP BY 1
      ORDER BY 1
    `, [userId])

    // Montar todos os meses, incluindo os sem movimento
    const timeline = []
    let cumulative = 0

    // Saldo acumulado anterior ao período
    const prevBalance = await query(`
      SELECT SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as balance
      FROM transactions
      WHERE user_id = $1 AND status = 'completed'
        AND COALESCE(paid_date, due_date, created_at::date) <
          DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '${months - 1} months'
        AND deleted_at IS NULL
    `, [userId])
    cumulative = parseFloat(prevBalance.rows[0]?.balance || 0)

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const row = result.rows.find(r => r.month === key)
      const income = parseFloat(row?.income || 0)
      const expense = parseFloat(row?.expense || 0)
      cumulative += income - expense
      timeline.push({
        month: key,
        month_name: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
        income, expense,
        balance: income - expense,
        cumulative
      })
    }

    return { timeline, current_patrimony: cumulative }
  })

  // Planejamento mensal — meta de receita + comparativo budget
  app.get('/planning', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const { month, year } = request.query
    const now = new Date()
    const m = parseInt(month || now.getMonth() + 1)
    const y = parseInt(year || now.getFullYear())
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end = new Date(y, m, 0).toISOString().split('T')[0]

    // Meta de receita
    const goalRes = await query(
      'SELECT * FROM monthly_income_goals WHERE user_id = $1 AND month = $2 AND year = $3',
      [userId, m, y]
    )

    // Receita e despesa reais
    const actualRes = await query(`
      SELECT
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
      FROM transactions
      WHERE user_id = $1 AND status = 'completed' AND paid_date BETWEEN $2 AND $3 AND deleted_at IS NULL
    `, [userId, start, end])

    // Metas de despesa por categoria
    const budgetsRes = await query(`
      SELECT b.*, c.name as category_name, c.color,
        COALESCE(SUM(t.amount), 0) as spent
      FROM budgets b
      JOIN categories c ON b.category_id = c.id
      LEFT JOIN transactions t ON t.category_id = c.id
        AND t.type = 'expense' AND t.status = 'completed'
        AND t.paid_date BETWEEN $2 AND $3 AND t.user_id = $1
        AND t.deleted_at IS NULL
      WHERE b.user_id = $1 AND b.month = $4 AND b.year = $5
      GROUP BY b.id, c.name, c.color
    `, [userId, start, end, m, y])

    const targetIncome = parseFloat(goalRes.rows[0]?.target_income || 0)
    const actualIncome = parseFloat(actualRes.rows[0]?.income || 0)
    const actualExpense = parseFloat(actualRes.rows[0]?.expense || 0)
    const totalBudget = budgetsRes.rows.reduce((s, r) => s + parseFloat(r.amount), 0)

    return {
      period: { month: m, year: y },
      income: {
        target: targetIncome,
        actual: actualIncome,
        pct: targetIncome > 0 ? Math.min(200, (actualIncome / targetIncome * 100)) : 0,
        diff: actualIncome - targetIncome
      },
      expense: {
        budget_total: totalBudget,
        actual: actualExpense,
        pct: totalBudget > 0 ? Math.min(200, (actualExpense / totalBudget * 100)) : 0,
        diff: actualExpense - totalBudget
      },
      result: {
        planned: targetIncome - totalBudget,
        actual: actualIncome - actualExpense
      },
      budgets: budgetsRes.rows.map(b => ({
        ...b,
        amount: parseFloat(b.amount),
        spent: parseFloat(b.spent),
        remaining: parseFloat(b.amount) - parseFloat(b.spent),
        pct: parseFloat(b.amount) > 0 ? Math.min(100, parseFloat(b.spent) / parseFloat(b.amount) * 100) : 0
      }))
    }
  })

  app.post('/planning/income-goal', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { month, year, target_income } = request.body
    if (!month || !year || target_income == null) return reply.code(400).send({ error: 'Campos obrigatórios' })

    const result = await query(`
      INSERT INTO monthly_income_goals (user_id, month, year, target_income)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, month, year) DO UPDATE SET target_income = $4
      RETURNING *
    `, [userId, month, year, target_income])
    return result.rows[0]
  })

  // Lucratividade por produto
  app.get('/products', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const { month, year } = request.query
    const now = new Date()
    const m = parseInt(month || now.getMonth() + 1)
    const y = parseInt(year || now.getFullYear())
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end = new Date(y, m, 0).toISOString().split('T')[0]

    const result = await query(`
      SELECT
        p.id, p.name, p.price, p.cost as unit_cost, p.unit,
        COALESCE(SUM(t.product_quantity), 0) as qty_sold,
        COALESCE(SUM(t.amount), 0) as revenue,
        COALESCE(SUM(t.product_quantity * COALESCE(p.cost, 0)), 0) as total_cost,
        COALESCE(SUM(t.amount), 0) - COALESCE(SUM(t.product_quantity * COALESCE(p.cost, 0)), 0) as profit
      FROM products p
      LEFT JOIN transactions t ON t.product_id = p.id
        AND t.type = 'income' AND t.status = 'completed'
        AND COALESCE(t.paid_date, t.due_date) BETWEEN $2 AND $3
        AND t.user_id = $1
        AND t.deleted_at IS NULL
      WHERE p.user_id = $1 AND p.active = true AND p.deleted_at IS NULL
      GROUP BY p.id, p.name, p.price, p.cost, p.unit
      ORDER BY revenue DESC
    `, [userId, start, end])

    const totals = result.rows.reduce((acc, r) => ({
      revenue: acc.revenue + parseFloat(r.revenue),
      cost: acc.cost + parseFloat(r.total_cost),
      profit: acc.profit + parseFloat(r.profit),
      qty_sold: acc.qty_sold + parseFloat(r.qty_sold)
    }), { revenue: 0, cost: 0, profit: 0, qty_sold: 0 })

    return {
      period: { month: m, year: y, start, end },
      products: result.rows.map(r => ({
        ...r,
        price: parseFloat(r.price),
        unit_cost: parseFloat(r.unit_cost || 0),
        qty_sold: parseFloat(r.qty_sold),
        revenue: parseFloat(r.revenue),
        cost: parseFloat(r.total_cost),
        profit: parseFloat(r.profit),
        margin: parseFloat(r.revenue) > 0 ? (parseFloat(r.profit) / parseFloat(r.revenue) * 100) : 0
      })),
      totals
    }
  })

  // Relatório Fiscal Anual (para IRPF)
  app.get('/fiscal', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const year = parseInt(request.query.year || new Date().getFullYear())

    // Receitas por categoria (mensal)
    const incomeRes = await query(`
      SELECT
        EXTRACT(MONTH FROM COALESCE(paid_date, due_date)) as month,
        COALESCE(c.name, 'Sem categoria') as category,
        SUM(t.amount) as total,
        COUNT(*) as count
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'income' AND t.status = 'completed'
        AND EXTRACT(YEAR FROM COALESCE(t.paid_date, t.due_date)) = $2
        AND t.deleted_at IS NULL
      GROUP BY 1, 2
      ORDER BY 1, total DESC
    `, [userId, year])

    // Despesas por categoria (mensal)
    const expenseRes = await query(`
      SELECT
        EXTRACT(MONTH FROM COALESCE(paid_date, due_date)) as month,
        COALESCE(c.name, 'Sem categoria') as category,
        SUM(t.amount) as total,
        COUNT(*) as count
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'expense' AND t.status = 'completed'
        AND EXTRACT(YEAR FROM COALESCE(t.paid_date, t.due_date)) = $2
        AND t.deleted_at IS NULL
      GROUP BY 1, 2
      ORDER BY 1, total DESC
    `, [userId, year])

    // Totais anuais
    const totalsRes = await query(`
      SELECT
        type,
        SUM(amount) as total,
        COUNT(*) as count
      FROM transactions
      WHERE user_id = $1 AND status = 'completed'
        AND EXTRACT(YEAR FROM COALESCE(paid_date, due_date)) = $2
        AND deleted_at IS NULL
      GROUP BY type
    `, [userId, year])

    // Receitas por categoria (total anual)
    const incomeByCatRes = await query(`
      SELECT
        COALESCE(c.name, 'Sem categoria') as category,
        SUM(t.amount) as total,
        COUNT(*) as count
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'income' AND t.status = 'completed'
        AND EXTRACT(YEAR FROM COALESCE(t.paid_date, t.due_date)) = $2
        AND t.deleted_at IS NULL
      GROUP BY c.name
      ORDER BY total DESC
    `, [userId, year])

    // Despesas por categoria (total anual)
    const expenseByCatRes = await query(`
      SELECT
        COALESCE(c.name, 'Sem categoria') as category,
        SUM(t.amount) as total,
        COUNT(*) as count
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'expense' AND t.status = 'completed'
        AND EXTRACT(YEAR FROM COALESCE(t.paid_date, t.due_date)) = $2
        AND t.deleted_at IS NULL
      GROUP BY c.name
      ORDER BY total DESC
    `, [userId, year])

    // Resumo mensal (12 meses)
    const monthlyRes = await query(`
      SELECT
        EXTRACT(MONTH FROM COALESCE(paid_date, due_date)) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
      FROM transactions
      WHERE user_id = $1 AND status = 'completed'
        AND EXTRACT(YEAR FROM COALESCE(paid_date, due_date)) = $2
        AND deleted_at IS NULL
      GROUP BY 1
      ORDER BY 1
    `, [userId, year])

    const totalIncome = totalsRes.rows.find(r => r.type === 'income')
    const totalExpense = totalsRes.rows.find(r => r.type === 'expense')

    // Montar resumo mensal completo
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const row = monthlyRes.rows.find(r => parseInt(r.month) === m)
      const income = parseFloat(row?.income || 0)
      const expense = parseFloat(row?.expense || 0)
      return {
        month: m,
        month_name: new Date(year, i, 1).toLocaleString('pt-BR', { month: 'long' }),
        income,
        expense,
        balance: income - expense
      }
    })

    return {
      year,
      summary: {
        total_income: parseFloat(totalIncome?.total || 0),
        total_expense: parseFloat(totalExpense?.total || 0),
        net_result: parseFloat(totalIncome?.total || 0) - parseFloat(totalExpense?.total || 0),
        income_count: parseInt(totalIncome?.count || 0),
        expense_count: parseInt(totalExpense?.count || 0)
      },
      income_by_category: incomeByCatRes.rows.map(r => ({
        category: r.category,
        total: parseFloat(r.total),
        count: parseInt(r.count)
      })),
      expense_by_category: expenseByCatRes.rows.map(r => ({
        category: r.category,
        total: parseFloat(r.total),
        count: parseInt(r.count)
      })),
      monthly,
      // Dados detalhados para demonstrativo mensal
      income_monthly_detail: incomeRes.rows.map(r => ({
        month: parseInt(r.month),
        category: r.category,
        total: parseFloat(r.total),
        count: parseInt(r.count)
      })),
      expense_monthly_detail: expenseRes.rows.map(r => ({
        month: parseInt(r.month),
        category: r.category,
        total: parseFloat(r.total),
        count: parseInt(r.count)
      }))
    }
  })

  // PDF do Relatório Fiscal Anual
  app.get('/fiscal/pdf', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const year = parseInt(request.query.year || new Date().getFullYear())

    const userRes = await query('SELECT name FROM users WHERE id = $1', [userId])
    const userName = userRes.rows[0]?.name || ''

    const totalsRes = await query(`
      SELECT type, SUM(amount) as total, COUNT(*) as count
      FROM transactions
      WHERE user_id = $1 AND status = 'completed'
        AND EXTRACT(YEAR FROM COALESCE(paid_date, due_date)) = $2
        AND deleted_at IS NULL
      GROUP BY type
    `, [userId, year])

    const incomeByCat = await query(`
      SELECT COALESCE(c.name, 'Sem categoria') as category, SUM(t.amount) as total
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'income' AND t.status = 'completed'
        AND EXTRACT(YEAR FROM COALESCE(t.paid_date, t.due_date)) = $2
        AND t.deleted_at IS NULL
      GROUP BY c.name ORDER BY total DESC
    `, [userId, year])

    const expenseByCat = await query(`
      SELECT COALESCE(c.name, 'Sem categoria') as category, SUM(t.amount) as total
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'expense' AND t.status = 'completed'
        AND EXTRACT(YEAR FROM COALESCE(t.paid_date, t.due_date)) = $2
        AND t.deleted_at IS NULL
      GROUP BY c.name ORDER BY total DESC
    `, [userId, year])

    const monthlyRes = await query(`
      SELECT EXTRACT(MONTH FROM COALESCE(paid_date, due_date)) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
      FROM transactions WHERE user_id = $1 AND status = 'completed'
        AND EXTRACT(YEAR FROM COALESCE(paid_date, due_date)) = $2
        AND deleted_at IS NULL
      GROUP BY 1 ORDER BY 1
    `, [userId, year])

    const totalIncome = parseFloat(totalsRes.rows.find(r => r.type === 'income')?.total || 0)
    const totalExpense = parseFloat(totalsRes.rows.find(r => r.type === 'expense')?.total || 0)
    const netResult = totalIncome - totalExpense
    const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks = []
    doc.on('data', c => chunks.push(c))

    await new Promise(resolve => {
      doc.on('end', resolve)

      // Header
      doc.rect(0, 0, 595, 85).fill('#1e3a5f')
      doc.fillColor('white').fontSize(22).font('Helvetica-Bold').text(`RELATORIO FISCAL — ${year}`, 50, 22)
      doc.fontSize(11).font('Helvetica').text(`${userName} — Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 50, 52)

      // Resumo executivo
      doc.y = 110
      const col = [50, 210, 370]
      const boxH = 60

      doc.rect(col[0], doc.y, 150, boxH).fillAndStroke('#f0fdf4', '#86efac')
      doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(9).text('RECEITA TOTAL', col[0] + 10, doc.y + 8, { width: 130, align: 'center' })
      doc.fontSize(16).text(fmt(totalIncome), col[0] + 10, doc.y + 24, { width: 130, align: 'center' })

      doc.rect(col[1], doc.y, 150, boxH).fillAndStroke('#fef2f2', '#fca5a5')
      doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(9).text('DESPESA TOTAL', col[1] + 10, doc.y + 8, { width: 130, align: 'center' })
      doc.fontSize(16).text(fmt(totalExpense), col[1] + 10, doc.y + 24, { width: 130, align: 'center' })

      const isPositive = netResult >= 0
      doc.rect(col[2], doc.y, 175, boxH).fillAndStroke(isPositive ? '#eef2ff' : '#fff7ed', isPositive ? '#a5b4fc' : '#fdba74')
      doc.fillColor(isPositive ? '#4338ca' : '#c2410c').font('Helvetica-Bold').fontSize(9).text('RESULTADO LIQUIDO', col[2] + 10, doc.y + 8, { width: 155, align: 'center' })
      doc.fontSize(16).text(fmt(netResult), col[2] + 10, doc.y + 24, { width: 155, align: 'center' })

      doc.y += boxH + 15

      // Tabela mensal
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke()
      doc.y += 10
      doc.fillColor('#1e3a5f').font('Helvetica-Bold').fontSize(12).text('DEMONSTRATIVO MENSAL', 50)
      doc.y += 8

      // Header tabela
      doc.rect(50, doc.y, 495, 18).fill('#f1f5f9')
      doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8)
      doc.text('MES', 55, doc.y + 5, { width: 100 })
      doc.text('RECEITAS', 200, doc.y + 5, { width: 100, align: 'right' })
      doc.text('DESPESAS', 310, doc.y + 5, { width: 100, align: 'right' })
      doc.text('RESULTADO', 430, doc.y + 5, { width: 100, align: 'right' })
      doc.y += 18

      for (let m = 1; m <= 12; m++) {
        const row = monthlyRes.rows.find(r => parseInt(r.month) === m)
        const inc = parseFloat(row?.income || 0)
        const exp = parseFloat(row?.expense || 0)
        const bal = inc - exp
        if (m % 2 === 0) doc.rect(50, doc.y, 495, 16).fill('#f9fafb')
        doc.fillColor('#374151').font('Helvetica').fontSize(8)
        doc.text(new Date(year, m - 1, 1).toLocaleString('pt-BR', { month: 'long' }).charAt(0).toUpperCase() + new Date(year, m - 1, 1).toLocaleString('pt-BR', { month: 'long' }).slice(1), 55, doc.y + 4, { width: 100 })
        doc.fillColor('#15803d').text(fmt(inc), 200, doc.y + 4, { width: 100, align: 'right' })
        doc.fillColor('#dc2626').text(fmt(exp), 310, doc.y + 4, { width: 100, align: 'right' })
        doc.fillColor(bal >= 0 ? '#1e3a5f' : '#dc2626').font('Helvetica-Bold').text(fmt(bal), 430, doc.y + 4, { width: 100, align: 'right' })
        doc.y += 16
      }

      // Total
      doc.rect(50, doc.y, 495, 20).fill('#1e3a5f')
      doc.fillColor('white').font('Helvetica-Bold').fontSize(9)
      doc.text('TOTAL ANUAL', 55, doc.y + 5)
      doc.text(fmt(totalIncome), 200, doc.y + 5, { width: 100, align: 'right' })
      doc.text(fmt(totalExpense), 310, doc.y + 5, { width: 100, align: 'right' })
      doc.text(fmt(netResult), 430, doc.y + 5, { width: 100, align: 'right' })
      doc.y += 30

      // Receitas por categoria
      if (incomeByCat.rows.length > 0 && doc.y < 650) {
        doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(10).text('RECEITAS POR CATEGORIA', 50)
        doc.y += 5
        doc.fillColor('#374151').font('Helvetica').fontSize(8)
        for (const r of incomeByCat.rows) {
          const pct = totalIncome > 0 ? (parseFloat(r.total) / totalIncome * 100).toFixed(1) : 0
          doc.text(`${r.category}`, 55, doc.y, { width: 250 })
          doc.fillColor('#15803d').font('Helvetica-Bold').text(fmt(parseFloat(r.total)), 350, doc.y, { width: 100, align: 'right' })
          doc.fillColor('#9ca3af').font('Helvetica').text(`${pct}%`, 460, doc.y, { width: 70, align: 'right' })
          doc.fillColor('#374151').font('Helvetica')
          doc.y += 14
          if (doc.y > 720) break
        }
        doc.y += 10
      }

      // Despesas por categoria
      if (expenseByCat.rows.length > 0 && doc.y < 700) {
        doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(10).text('DESPESAS POR CATEGORIA', 50)
        doc.y += 5
        doc.fillColor('#374151').font('Helvetica').fontSize(8)
        for (const r of expenseByCat.rows) {
          const pct = totalExpense > 0 ? (parseFloat(r.total) / totalExpense * 100).toFixed(1) : 0
          doc.text(`${r.category}`, 55, doc.y, { width: 250 })
          doc.fillColor('#dc2626').font('Helvetica-Bold').text(fmt(parseFloat(r.total)), 350, doc.y, { width: 100, align: 'right' })
          doc.fillColor('#9ca3af').font('Helvetica').text(`${pct}%`, 460, doc.y, { width: 70, align: 'right' })
          doc.fillColor('#374151').font('Helvetica')
          doc.y += 14
          if (doc.y > 750) break
        }
      }

      // Rodape
      doc.moveTo(50, 780).lineTo(545, 780).strokeColor('#e5e7eb').stroke()
      doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
        .text(`Relatorio fiscal gerado em ${new Date().toLocaleString('pt-BR')} — Financeiro MSX — Este documento e meramente informativo e nao substitui a declaracao oficial de IRPF`, 50, 788, { align: 'center', width: 495 })

      doc.end()
    })

    const buffer = Buffer.concat(chunks)
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="relatorio_fiscal_${year}.pdf"`)
    return reply.send(buffer)
  })

  // PDF do DRE
  app.get('/pdf', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { month, year } = request.query
    const now = new Date()
    const m = parseInt(month || now.getMonth() + 1)
    const y = parseInt(year || now.getFullYear())
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end = new Date(y, m, 0).toISOString().split('T')[0]
    const monthName = new Date(y, m - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

    const userRes = await query('SELECT name FROM users WHERE id = $1', [userId])
    const userName = userRes.rows[0]?.name || ''

    const incomeRes = await query(`
      SELECT COALESCE(c.name, 'Sem categoria') as category, COALESCE(c.color, '#22c55e') as color,
        SUM(t.amount) as total, COUNT(*) as count
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'income' AND t.status = 'completed'
        AND t.paid_date BETWEEN $2 AND $3 AND t.deleted_at IS NULL
      GROUP BY c.name, c.color ORDER BY total DESC
    `, [userId, start, end])

    const expenseRes = await query(`
      SELECT COALESCE(c.name, 'Sem categoria') as category, COALESCE(c.color, '#ef4444') as color,
        SUM(t.amount) as total, COUNT(*) as count
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'expense' AND t.status = 'completed'
        AND t.paid_date BETWEEN $2 AND $3 AND t.deleted_at IS NULL
      GROUP BY c.name, c.color ORDER BY total DESC
    `, [userId, start, end])

    const totalIncome = incomeRes.rows.reduce((s, r) => s + parseFloat(r.total), 0)
    const totalExpense = expenseRes.rows.reduce((s, r) => s + parseFloat(r.total), 0)
    const result = totalIncome - totalExpense
    const margin = totalIncome > 0 ? (result / totalIncome * 100) : 0
    const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks = []
    doc.on('data', c => chunks.push(c))

    await new Promise(resolve => {
      doc.on('end', resolve)

      // Header
      doc.rect(0, 0, 595, 80).fill('#4f46e5')
      doc.fillColor('white').fontSize(22).font('Helvetica-Bold').text('DEMONSTRAÇÃO DE RESULTADO', 50, 22)
      doc.fontSize(11).font('Helvetica').text(`${userName} · ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`, 50, 52)

      // Resumo executivo
      doc.y = 105
      const col = [50, 210, 370]
      const boxH = 65

      // Receitas
      doc.rect(col[0], doc.y, 150, boxH).fillAndStroke('#f0fdf4', '#86efac')
      doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(9).text('RECEITAS', col[0] + 10, doc.y + 10, { width: 130, align: 'center' })
      doc.fontSize(18).text(fmt(totalIncome), col[0] + 10, doc.y + 25, { width: 130, align: 'center' })

      // Despesas
      doc.rect(col[1], doc.y, 150, boxH).fillAndStroke('#fef2f2', '#fca5a5')
      doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(9).text('DESPESAS', col[1] + 10, doc.y + 10, { width: 130, align: 'center' })
      doc.fontSize(18).text(fmt(totalExpense), col[1] + 10, doc.y + 25, { width: 130, align: 'center' })

      // Resultado
      const isPositive = result >= 0
      doc.rect(col[2], doc.y, 175, boxH).fillAndStroke(isPositive ? '#eef2ff' : '#fff7ed', isPositive ? '#a5b4fc' : '#fdba74')
      doc.fillColor(isPositive ? '#4338ca' : '#c2410c').font('Helvetica-Bold').fontSize(9).text('RESULTADO', col[2] + 10, doc.y + 10, { width: 155, align: 'center' })
      doc.fontSize(18).text(fmt(result), col[2] + 10, doc.y + 25, { width: 155, align: 'center' })
      doc.fontSize(9).font('Helvetica').fillColor(isPositive ? '#6366f1' : '#ea580c')
        .text(`margem ${margin.toFixed(1)}%`, col[2] + 10, doc.y + 47, { width: 155, align: 'center' })

      doc.y += boxH + 20

      // Receitas por categoria
      if (incomeRes.rows.length > 0) {
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke()
        doc.y += 12
        doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(12).text('RECEITAS POR CATEGORIA', 50)
        doc.y += 8
        doc.fillColor('#4b5563').font('Helvetica').fontSize(9)
        incomeRes.rows.forEach(r => {
          const pct = totalIncome > 0 ? (parseFloat(r.total) / totalIncome * 100) : 0
          doc.text(r.category, 50, doc.y, { width: 280 })
          doc.text(r.count + ' lançamentos', 340, doc.y, { width: 100, align: 'right' })
          doc.fillColor('#15803d').font('Helvetica-Bold').text(fmt(parseFloat(r.total)), 445, doc.y, { width: 100, align: 'right' })
          doc.fillColor('#9ca3af').font('Helvetica').text(`${pct.toFixed(1)}%`, 50, doc.y + 1, { width: 280 })
          doc.y += 18
          doc.fillColor('#4b5563').font('Helvetica')
        })
        doc.y += 5
      }

      // Despesas por categoria
      if (expenseRes.rows.length > 0) {
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke()
        doc.y += 12
        doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(12).text('DESPESAS POR CATEGORIA', 50)
        doc.y += 8
        doc.fillColor('#4b5563').font('Helvetica').fontSize(9)
        expenseRes.rows.forEach(r => {
          const pct = totalExpense > 0 ? (parseFloat(r.total) / totalExpense * 100) : 0
          doc.text(r.category, 50, doc.y, { width: 280 })
          doc.text(r.count + ' lançamentos', 340, doc.y, { width: 100, align: 'right' })
          doc.fillColor('#dc2626').font('Helvetica-Bold').text(fmt(parseFloat(r.total)), 445, doc.y, { width: 100, align: 'right' })
          doc.fillColor('#9ca3af').font('Helvetica').text(`${pct.toFixed(1)}%`, 50, doc.y + 1, { width: 280 })
          doc.y += 18
          doc.fillColor('#4b5563').font('Helvetica')
        })
      }

      // Rodapé
      doc.moveTo(50, 780).lineTo(545, 780).strokeColor('#e5e7eb').stroke()
      doc.fillColor('#9ca3af').fontSize(8).font('Helvetica')
        .text(`Gerado em ${new Date().toLocaleString('pt-BR')} · Financeiro MSX`, 50, 790, { align: 'center', width: 495 })

      doc.end()
    })

    const buffer = Buffer.concat(chunks)
    const filename = `dre_${y}_${String(m).padStart(2, '0')}.pdf`
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return reply.send(buffer)
  })
}
