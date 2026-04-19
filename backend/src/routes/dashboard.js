import { query } from '../db/index.js'

// In-memory cache por usuário+mês+ano (TTL 5 min)
const _cache = new Map()
const CACHE_TTL = 5 * 60 * 1000
function getCached(key) {
  const e = _cache.get(key)
  if (!e) return null
  if (Date.now() - e.ts > CACHE_TTL) { _cache.delete(key); return null }
  return e.data
}
function setCache(key, data) {
  _cache.set(key, { data, ts: Date.now() })
  if (_cache.size > 500) _cache.delete(_cache.keys().next().value)
}
export function invalidateDashboardCache(userId) {
  for (const k of _cache.keys()) { if (k.startsWith(`dash_${userId}_`)) _cache.delete(k) }
}

export default async function dashboardRoutes(app) {
  // Cache-Control header para dashboard e reports
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/api/dashboard') || request.url.startsWith('/api/reports')) {
      reply.header('Cache-Control', 'private, max-age=60, stale-while-revalidate=300')
    }
  })

  // Alertas inteligentes: despesas altas, parcelas próximas, dívidas vencidas
  app.get('/alerts', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const alerts = []

    // Dívidas vencidas
    const overdueDebts = await query(`
      SELECT COUNT(*)::int AS c, COALESCE(SUM(amount - paid_amount), 0) AS total
      FROM debts WHERE user_id = $1 AND status IN ('pending', 'partial', 'overdue')
        AND due_date < CURRENT_DATE
    `, [userId])
    if (overdueDebts.rows[0].c > 0) {
      alerts.push({
        severity: 'error',
        icon: '⚠️',
        title: `${overdueDebts.rows[0].c} dívida(s) vencida(s)`,
        message: `Total em atraso: R$ ${parseFloat(overdueDebts.rows[0].total).toFixed(2)}`,
        link: '/debts/payable'
      })
    }

    // Parcelas de empréstimo próximas (7 dias)
    const upcoming = await query(`
      SELECT COUNT(*)::int AS c
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      WHERE li.user_id = $1 AND NOT li.paid
        AND li.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    `, [userId])
    if (upcoming.rows[0].c > 0) {
      alerts.push({
        severity: 'warning',
        icon: '📅',
        title: `${upcoming.rows[0].c} parcela(s) vencem em 7 dias`,
        message: 'Considere enviar cobrança antecipada',
        link: '/loans'
      })
    }

    // Despesa do mês vs média 3 meses anteriores
    const now = new Date()
    const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const threeMoAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0]
    const avgRes = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN paid_date >= $2 THEN amount ELSE 0 END), 0) AS this_month,
        COALESCE(SUM(CASE WHEN paid_date >= $3 AND paid_date < $2 THEN amount ELSE 0 END) / 3, 0) AS avg_prev
      FROM transactions
      WHERE user_id = $1 AND type = 'expense' AND status = 'completed'
        AND paid_date >= $3
    `, [userId, thisMonthStart, threeMoAgo])
    const thisMonth = parseFloat(avgRes.rows[0].this_month)
    const avgPrev = parseFloat(avgRes.rows[0].avg_prev)
    if (avgPrev > 0 && thisMonth > avgPrev * 1.2) {
      const pct = Math.round((thisMonth / avgPrev - 1) * 100)
      alerts.push({
        severity: 'warning',
        icon: '📈',
        title: `Despesas ${pct}% acima da média`,
        message: `Este mês: R$ ${thisMonth.toFixed(2)} · média: R$ ${avgPrev.toFixed(2)}`,
        link: '/expenses'
      })
    }

    // Produtos com estoque baixo
    const lowStock = await query(`
      SELECT COUNT(*)::int AS c FROM products
      WHERE user_id = $1 AND active = true AND stock_quantity <= min_stock AND min_stock > 0
    `, [userId])
    if (lowStock.rows[0].c > 0) {
      alerts.push({
        severity: 'warning',
        icon: '📦',
        title: `${lowStock.rows[0].c} produto(s) com estoque baixo`,
        message: 'Verifique o painel de Produtos',
        link: '/products'
      })
    }

    // Meta de receita (se configurada) e progresso
    const goalRes = await query(`
      SELECT target_income FROM monthly_income_goals
      WHERE user_id = $1 AND month = $2 AND year = $3
    `, [userId, now.getMonth() + 1, now.getFullYear()]).catch(() => ({ rows: [] }))
    if (goalRes.rows[0]?.target_income) {
      const incomeRes = await query(`
        SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
        WHERE user_id = $1 AND type = 'income' AND status = 'completed'
          AND paid_date >= $2
      `, [userId, thisMonthStart])
      const target = parseFloat(goalRes.rows[0].target_income)
      const earned = parseFloat(incomeRes.rows[0].total)
      const pct = Math.round((earned / target) * 100)
      if (pct < 50) {
        alerts.push({
          severity: 'info',
          icon: '🎯',
          title: `Meta mensal: ${pct}% atingida`,
          message: `R$ ${earned.toFixed(2)} de R$ ${target.toFixed(2)}`,
          link: '/reports'
        })
      }
    }

    return { alerts }
  })

  // Evolução patrimonial: últimos 12 meses
  app.get('/patrimony-history', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const rows = await query(`
      WITH months AS (
        SELECT date_trunc('month', CURRENT_DATE - (n || ' months')::interval)::date AS m
        FROM generate_series(0, 11) n
      )
      SELECT
        to_char(m.m, 'YYYY-MM') AS month,
        COALESCE((SELECT SUM(amount) FROM transactions
          WHERE user_id = $1 AND type = 'income' AND status = 'completed'
          AND paid_date >= m.m AND paid_date < m.m + INTERVAL '1 month'), 0) AS income,
        COALESCE((SELECT SUM(amount) FROM transactions
          WHERE user_id = $1 AND type = 'expense' AND status = 'completed'
          AND paid_date >= m.m AND paid_date < m.m + INTERVAL '1 month'), 0) AS expense
      FROM months m
      ORDER BY m.m ASC
    `, [userId])

    let cumulative = 0
    const data = rows.rows.map(r => {
      const income = parseFloat(r.income)
      const expense = parseFloat(r.expense)
      const net = income - expense
      cumulative += net
      return { month: r.month, income, expense, net, cumulative }
    })
    return { data }
  })

  app.get('/', {
    preHandler: [app.authenticate]
  }, async (request) => {
    const userId = request.user.id
    const { month, year } = request.query

    const now = new Date()
    const m = parseInt(month || now.getMonth() + 1)
    const y = parseInt(year || now.getFullYear())

    const cacheKey = `dash_${userId}_${m}_${y}`
    const cached = getCached(cacheKey)
    if (cached) return cached

    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const endDate = new Date(y, m, 0).toISOString().split('T')[0]

    // Receitas e despesas do mês
    const incomeRes = await query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE user_id = $1 AND type = 'income' AND status = 'completed'
        AND paid_date BETWEEN $2 AND $3
    `, [userId, startDate, endDate])

    const expenseRes = await query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE user_id = $1 AND type = 'expense' AND status = 'completed'
        AND paid_date BETWEEN $2 AND $3
    `, [userId, startDate, endDate])

    // Mês anterior para comparação
    const prevDate = new Date(y, m - 2, 1)
    const prevM = prevDate.getMonth() + 1
    const prevY = prevDate.getFullYear()
    const prevStart = `${prevY}-${String(prevM).padStart(2, '0')}-01`
    const prevEnd = new Date(prevY, prevM, 0).toISOString().split('T')[0]

    const prevIncomeRes = await query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE user_id = $1 AND type = 'income' AND status = 'completed'
        AND paid_date BETWEEN $2 AND $3
    `, [userId, prevStart, prevEnd])

    const prevExpenseRes = await query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE user_id = $1 AND type = 'expense' AND status = 'completed'
        AND paid_date BETWEEN $2 AND $3
    `, [userId, prevStart, prevEnd])

    // Dívidas pendentes
    const debtsPayableRes = await query(`
      SELECT COALESCE(SUM(amount - paid_amount), 0) as total, COUNT(*) as count
      FROM debts
      WHERE user_id = $1 AND type = 'payable' AND status IN ('pending', 'partial', 'overdue')
    `, [userId])

    const debtsReceivableRes = await query(`
      SELECT COALESCE(SUM(amount - paid_amount), 0) as total, COUNT(*) as count
      FROM debts
      WHERE user_id = $1 AND type = 'receivable' AND status IN ('pending', 'partial', 'overdue')
    `, [userId])

    // Dívidas vencidas
    const overdueRes = await query(`
      SELECT COUNT(*) as count FROM debts
      WHERE user_id = $1 AND status != 'paid' AND due_date < CURRENT_DATE
    `, [userId])

    // Produtos com estoque baixo
    const lowStockRes = await query(`
      SELECT COUNT(*) as count FROM products
      WHERE user_id = $1 AND active = true AND stock_quantity <= min_stock AND min_stock > 0
    `, [userId])

    // Empréstimos ativos
    const loansRes = await query(`
      SELECT
        COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active') as active_count,
        COALESCE(SUM(li.total_amount + li.late_fee_amount) FILTER (WHERE NOT li.paid AND l.status = 'active'), 0) as total_receivable,
        COUNT(li.id) FILTER (WHERE NOT li.paid AND li.due_date < CURRENT_DATE AND l.status = 'active') as overdue_installments
      FROM loans l
      LEFT JOIN loan_installments li ON li.loan_id = l.id
      WHERE l.user_id = $1
    `, [userId])

    // Gráfico mensal (últimos 6 meses)
    const chartRes = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', COALESCE(paid_date, due_date, created_at::date)), 'YYYY-MM') as month,
        type,
        COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE user_id = $1 AND status = 'completed'
        AND COALESCE(paid_date, due_date, created_at::date) >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY 1, 2
      ORDER BY 1
    `, [userId])

    // Transações recentes
    const recentRes = await query(`
      SELECT t.*, c.name as category_name, c.color as category_color
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT 10
    `, [userId])

    // Próximos eventos
    const eventsRes = await query(`
      SELECT * FROM calendar_events
      WHERE user_id = $1 AND start_date >= NOW()
      ORDER BY start_date ASC
      LIMIT 5
    `, [userId])

    // Montar gráfico
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    const chartData = months.map(mo => {
      const inc = chartRes.rows.find(r => r.month === mo && r.type === 'income')
      const exp = chartRes.rows.find(r => r.month === mo && r.type === 'expense')
      return {
        month: mo,
        income: parseFloat(inc?.total || 0),
        expense: parseFloat(exp?.total || 0)
      }
    })

    const result = {
      summary: {
        income: parseFloat(incomeRes.rows[0].total),
        expense: parseFloat(expenseRes.rows[0].total),
        balance: parseFloat(incomeRes.rows[0].total) - parseFloat(expenseRes.rows[0].total),
        prev_income: parseFloat(prevIncomeRes.rows[0].total),
        prev_expense: parseFloat(prevExpenseRes.rows[0].total),
        debts_payable: parseFloat(debtsPayableRes.rows[0].total),
        debts_payable_count: parseInt(debtsPayableRes.rows[0].count),
        debts_receivable: parseFloat(debtsReceivableRes.rows[0].total),
        debts_receivable_count: parseInt(debtsReceivableRes.rows[0].count),
        overdue_count: parseInt(overdueRes.rows[0].count),
        low_stock_count: parseInt(lowStockRes.rows[0].count),
        loans_active: parseInt(loansRes.rows[0].active_count),
        loans_receivable: parseFloat(loansRes.rows[0].total_receivable),
        loans_overdue_installments: parseInt(loansRes.rows[0].overdue_installments),
      },
      chart: chartData,
      recent_transactions: recentRes.rows,
      upcoming_events: eventsRes.rows
    }
    setCache(cacheKey, result)
    return result
  })

  // Despesas por categoria
  app.get('/by-category', {
    preHandler: [app.authenticate]
  }, async (request) => {
    const userId = request.user.id
    const { month, year } = request.query

    const now = new Date()
    const m = parseInt(month || now.getMonth() + 1)
    const y = parseInt(year || now.getFullYear())
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const endDate = new Date(y, m, 0).toISOString().split('T')[0]

    const result = await query(`
      SELECT c.name, c.color, COALESCE(SUM(t.amount), 0) as total
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id
        AND t.status = 'completed'
        AND t.paid_date BETWEEN $2 AND $3
        AND t.user_id = $1
      WHERE c.user_id = $1 AND c.type = 'expense'
      GROUP BY c.id, c.name, c.color
      HAVING COALESCE(SUM(t.amount), 0) > 0
      ORDER BY total DESC
    `, [userId, startDate, endDate])

    return result.rows
  })
}
