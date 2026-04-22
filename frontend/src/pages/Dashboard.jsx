import { useState, useEffect } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import api from '../api'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

function pctChange(curr, prev) {
  if (!prev || prev === 0) return null
  const pct = ((curr - prev) / prev) * 100
  return pct
}

function StatCard({ title, value, icon, color, sub, prev, currNum }) {
  const change = prev != null && currNum != null ? pctChange(currNum, prev) : null
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
        {change != null && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${change >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'}`}>
            {change >= 0 ? '+' : ''}{change.toFixed(1)}% vs mês ant.
          </span>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [categories, setCategories] = useState([])
  const [cashflow, setCashflow] = useState(null)
  const [planning, setPlanning] = useState(null)
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState([])
  const [smartAlerts, setSmartAlerts] = useState([])
  const [patrimonyHistory, setPatrimonyHistory] = useState([])
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  const load = async () => {
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
      const [dashRes, catRes, cashRes, planRes, debtsRes, txRes, smartRes, patrRes] = await Promise.allSettled([
        api.get(`/api/dashboard?month=${month}&year=${year}`),
        api.get(`/api/dashboard/by-category?month=${month}&year=${year}`),
        api.get('/api/reports/cashflow?days=30'),
        api.get(`/api/reports/planning?month=${month}&year=${year}`),
        api.get(`/api/debts?status=pending&start_date=${today}&end_date=${tomorrow}&limit=100`),
        api.get(`/api/transactions?status=pending&start_date=${today}&end_date=${tomorrow}&limit=100`),
        api.get('/api/dashboard/alerts'),
        api.get('/api/dashboard/patrimony-history')
      ])
      if (dashRes.status === 'fulfilled') setData(dashRes.value.data)
      if (catRes.status === 'fulfilled') setCategories(catRes.value.data)
      if (cashRes.status === 'fulfilled') setCashflow(cashRes.value.data)
      if (planRes.status === 'fulfilled') setPlanning(planRes.value.data)
      if (smartRes.status === 'fulfilled') setSmartAlerts(smartRes.value.data.alerts || [])
      if (patrRes.status === 'fulfilled') setPatrimonyHistory(patrRes.value.data.data || [])
      const allAlerts = [
        ...(debtsRes.status === 'fulfilled' ? debtsRes.value.data.data.map(d => ({ type: 'debt', label: d.description, amount: d.amount, date: d.due_date })) : []),
        ...(txRes.status === 'fulfilled' ? txRes.value.data.data.map(t => ({ type: 'transaction', label: t.description, amount: t.amount, date: t.due_date })) : [])
      ]
      setAlerts(allAlerts)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [month, year])

  if (loading) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse" />
          <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-56 mt-2 animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
            <div className="flex items-center justify-between mb-3">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>
            <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-1" />
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
            <div className="flex items-center justify-between mb-3">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>
            <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-1" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 h-72 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4" />
          <div className="h-full bg-gray-100 dark:bg-gray-700/50 rounded-lg" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 h-72 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-40 mb-4" />
          <div className="w-40 h-40 bg-gray-100 dark:bg-gray-700/50 rounded-full mx-auto mt-8" />
        </div>
      </div>
    </div>
  )

  const s = data?.summary || {}

  const barData = {
    labels: data?.chart?.map(c => {
      const [y, m] = c.month.split('-')
      return new Date(y, m - 1).toLocaleString('pt-BR', { month: 'short', year: '2-digit' })
    }) || [],
    datasets: [
      { label: 'Receitas', data: data?.chart?.map(c => c.income) || [], backgroundColor: '#22c55e', borderRadius: 6 },
      { label: 'Despesas', data: data?.chart?.map(c => c.expense) || [], backgroundColor: '#ef4444', borderRadius: 6 },
    ]
  }

  const doughnutData = categories.length > 0 ? {
    labels: categories.map(c => c.name),
    datasets: [{
      data: categories.map(c => parseFloat(c.total)),
      backgroundColor: categories.map(c => c.color || '#6366f1'),
      borderWidth: 0
    }]
  } : null

  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-500 text-xs sm:text-sm">Visão geral das suas finanças</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Alertas inteligentes (backend) */}
      {smartAlerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {smartAlerts.map((a, i) => {
            const cls = a.severity === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
              : a.severity === 'warning'
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
            return (
              <a key={i} href={a.link}
                className={`rounded-xl border p-4 flex items-start gap-3 hover:shadow-sm transition-shadow ${cls}`}>
                <span className="text-xl shrink-0">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{a.title}</p>
                  <p className="text-xs opacity-80 mt-0.5">{a.message}</p>
                </div>
              </a>
            )
          })}
        </div>
      )}

      {/* Alertas de vencimento */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm mb-1">
                {alerts.length} vencimento{alerts.length > 1 ? 's' : ''} hoje ou amanhã
              </p>
              <div className="flex flex-wrap gap-2">
                {alerts.slice(0, 5).map((a, i) => (
                  <span key={i} className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full">
                    {a.label} · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(a.amount)}
                  </span>
                ))}
                {alerts.length > 5 && <span className="text-xs text-amber-600 dark:text-amber-400">+{alerts.length - 5} mais</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meta de Receita + Previsão de Fechamento */}
      {(planning?.income?.target > 0 || s.income > 0) && (() => {
        const today2 = new Date()
        const daysInMonth = new Date(year, month, 0).getDate()
        const dayElapsed = Math.min(today2.getDate(), daysInMonth)
        const dailyIncomeRate = dayElapsed > 0 ? s.income / dayElapsed : 0
        const dailyExpenseRate = dayElapsed > 0 ? s.expense / dayElapsed : 0
        const forecastIncome = dailyIncomeRate * daysInMonth
        const forecastExpense = dailyExpenseRate * daysInMonth
        const forecastBalance = forecastIncome - forecastExpense
        const goalPct = planning?.income?.target > 0 ? Math.min(100, (s.income / planning.income.target) * 100) : 0
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {planning?.income?.target > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Meta de Receita</span>
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{goalPct.toFixed(1)}%</span>
                </div>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{fmt(s.income)}</span>
                  <span className="text-xs text-gray-400">meta: {fmt(planning.income.target)}</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${goalPct >= 100 ? 'bg-green-500' : goalPct >= 75 ? 'bg-indigo-500' : goalPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${goalPct}%` }}
                  />
                </div>
                {planning.income.diff !== 0 && (
                  <p className={`text-xs mt-1 ${planning.income.diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {planning.income.diff >= 0 ? '▲' : '▼'} {fmt(Math.abs(planning.income.diff))} {planning.income.diff >= 0 ? 'acima' : 'abaixo'} da meta
                  </p>
                )}
              </div>
            )}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Previsão de Fechamento</span>
                <span className="text-xs text-gray-400">{dayElapsed}/{daysInMonth} dias</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-gray-400">Receita prev.</p>
                  <p className="text-sm font-bold text-green-600">{fmt(forecastIncome)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Despesa prev.</p>
                  <p className="text-sm font-bold text-red-600">{fmt(forecastExpense)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Resultado prev.</p>
                  <p className={`text-sm font-bold ${forecastBalance >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{fmt(forecastBalance)}</p>
                </div>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-3">
                <div className="h-1.5 bg-indigo-400 rounded-full" style={{ width: `${(dayElapsed / daysInMonth) * 100}%` }} />
              </div>
            </div>
          </div>
        )
      })()}

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Receitas do Mês" value={fmt(s.income)} icon="📈" color="text-green-600" sub="Concluídas" currNum={s.income} prev={s.prev_income} />
        <StatCard title="Despesas do Mês" value={fmt(s.expense)} icon="📉" color="text-red-600" sub="Concluídas" currNum={s.expense} prev={s.prev_expense} />
        <StatCard title="Saldo" value={fmt(s.balance)} icon="💰" color={s.balance >= 0 ? 'text-indigo-600' : 'text-red-600'} />
        <StatCard title="Dívidas Vencidas" value={s.overdue_count || 0} icon="⚠️" color="text-orange-600" sub="Requerem atenção" />
      </div>

      {/* Cards secundários */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="A Pagar" value={fmt(s.debts_payable)} icon="💸" color="text-red-500" sub={`${s.debts_payable_count || 0} pendentes`} />
        <StatCard title="A Receber" value={fmt(s.debts_receivable)} icon="💵" color="text-green-500" sub={`${s.debts_receivable_count || 0} pendentes`} />
        <StatCard title="Estoque Baixo" value={s.low_stock_count || 0} icon="📦" color="text-yellow-600" sub="Produtos" />
        <StatCard title="Próx. Eventos" value={data?.upcoming_events?.length || 0} icon="📅" color="text-blue-600" sub="Nos próximos dias" />
      </div>

      {/* Cards empréstimos */}
      {(s.loans_active > 0 || s.loans_receivable > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title="Empréstimos Ativos" value={s.loans_active || 0} icon="🤝" color="text-indigo-600" sub="contratos em aberto" />
          <StatCard title="A Receber (Empréstimos)" value={fmt(s.loans_receivable)} icon="💰" color="text-green-600" sub="parcelas pendentes" />
          {s.loans_overdue_installments > 0 && (
            <StatCard title="Parcelas Vencidas" value={s.loans_overdue_installments} icon="⚠️" color="text-red-600" sub="empréstimos em atraso" />
          )}
        </div>
      )}

      {/* Evolução Patrimonial (12 meses) */}
      {patrimonyHistory.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Evolução Patrimonial — 12 meses</h3>
          <Line
            data={{
              labels: patrimonyHistory.map(d => {
                const [y, m] = d.month.split('-')
                return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
              }),
              datasets: [
                {
                  label: 'Patrimônio acumulado',
                  data: patrimonyHistory.map(d => d.cumulative),
                  borderColor: '#10b981',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  fill: true,
                  tension: 0.3,
                  yAxisID: 'y'
                },
                {
                  label: 'Líquido mês',
                  data: patrimonyHistory.map(d => d.net),
                  borderColor: '#6366f1',
                  backgroundColor: 'rgba(99, 102, 241, 0)',
                  tension: 0.3,
                  yAxisID: 'y'
                }
              ]
            }}
            options={{
              responsive: true,
              plugins: { legend: { position: 'bottom' } },
              scales: { y: { ticks: { callback: v => fmt(v) } } }
            }}
          />
        </div>
      )}

      {/* Cashflow projetado */}
      {cashflow?.timeline?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Fluxo de Caixa — Próximos 30 dias</h3>
          <Line
            data={{
              labels: cashflow.timeline.map(d => new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })),
              datasets: [{
                label: 'Saldo Projetado',
                data: cashflow.timeline.map(d => d.balance),
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 3,
              }]
            }}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { ticks: { callback: v => fmt(v) } } }
            }}
          />
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Receitas vs Despesas (6 meses)</h3>
          <Bar data={barData} options={{
            responsive: true, maintainAspectRatio: true,
            plugins: { legend: { position: 'top' } },
            scales: { y: { beginAtZero: true, ticks: { callback: v => fmt(v) } } }
          }} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Despesas por Categoria</h3>
          {doughnutData ? (
            <Doughnut data={doughnutData} options={{
              responsive: true,
              plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }
            }} />
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Sem dados para o período
            </div>
          )}
        </div>
      </div>

      {/* Transações recentes + Próximos eventos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Transações Recentes</h3>
          <div className="space-y-3">
            {data?.recent_transactions?.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">Nenhuma transação</p>
            )}
            {data?.recent_transactions?.map(tx => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                    style={{ backgroundColor: (tx.category_color || '#6366f1') + '20' }}
                  >
                    {tx.type === 'income' ? '📈' : '📉'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 truncate max-w-[150px]">{tx.description}</p>
                    <p className="text-xs text-gray-400">{tx.category_name || 'Sem categoria'}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                  {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Próximos Eventos</h3>
          <div className="space-y-3">
            {data?.upcoming_events?.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">Nenhum evento próximo</p>
            )}
            {data?.upcoming_events?.map(ev => (
              <div key={ev.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                <div className="bg-indigo-100 text-indigo-600 rounded-lg p-2 text-center min-w-[44px]">
                  <div className="text-xs font-bold">
                    {new Date(ev.start_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).split(' ').join('\n')}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{ev.title}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(ev.start_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {ev.notify_whatsapp && ' · 💬 WhatsApp'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
