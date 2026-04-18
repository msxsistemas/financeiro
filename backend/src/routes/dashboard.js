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
