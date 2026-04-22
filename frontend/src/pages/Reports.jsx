import { useState, useEffect } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import MaskedInput from '../components/MaskedInput'
import api from '../api'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

function FiscalReport({ year }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get(`/api/reports/fiscal?year=${year}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Erro ao carregar relatório fiscal'))
      .finally(() => setLoading(false))
  }, [year])

  const downloadPdf = async () => {
    setPdfLoading(true)
    try {
      const token = localStorage.getItem('fin_token')
      const baseUrl = import.meta.env.VITE_API_URL || 'https://apifinanceiro.msxsystem.site'
      const res = await fetch(`${baseUrl}/api/reports/fiscal/pdf?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `relatorio_fiscal_${year}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao gerar PDF') }
    finally { setPdfLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
  if (!data) return <div className="text-center py-12 text-gray-400">Sem dados fiscais para {year}</div>

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">Relatório Fiscal — {year}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Resumo anual de receitas e despesas por categoria</p>
        </div>
        <button onClick={downloadPdf} disabled={pdfLoading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {pdfLoading ? '⏳ Gerando...' : '📄 Baixar PDF'}
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">Receita Total</p>
          <p className="text-xl font-bold text-green-700 dark:text-green-300 mt-1">{fmt(data.summary.total_income)}</p>
          <p className="text-xs text-green-500 mt-1">{data.summary.income_count} lancamentos</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">Despesa Total</p>
          <p className="text-xl font-bold text-red-700 dark:text-red-300 mt-1">{fmt(data.summary.total_expense)}</p>
          <p className="text-xs text-red-500 mt-1">{data.summary.expense_count} lancamentos</p>
        </div>
        <div className={`border rounded-xl p-4 text-center ${data.summary.net_result >= 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'}`}>
          <p className={`text-xs font-medium ${data.summary.net_result >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>Resultado Líquido</p>
          <p className={`text-xl font-bold mt-1 ${data.summary.net_result >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-orange-700 dark:text-orange-300'}`}>{fmt(data.summary.net_result)}</p>
        </div>
      </div>

      {/* Tabela mensal */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Mês</th>
              <th className="text-right px-4 py-3 text-green-600 font-medium">Receitas</th>
              <th className="text-right px-4 py-3 text-red-600 font-medium">Despesas</th>
              <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {data.monthly.map(m => (
              <tr key={m.month} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2 capitalize text-gray-700 dark:text-gray-300">{m.month_name}</td>
                <td className="px-4 py-2 text-right text-green-600 font-medium">{fmt(m.income)}</td>
                <td className="px-4 py-2 text-right text-red-600 font-medium">{fmt(m.expense)}</td>
                <td className={`px-4 py-2 text-right font-bold ${m.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{fmt(m.balance)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 font-bold">
              <td className="px-4 py-3 text-gray-800 dark:text-white">TOTAL ANUAL</td>
              <td className="px-4 py-3 text-right text-green-700 dark:text-green-400">{fmt(data.summary.total_income)}</td>
              <td className="px-4 py-3 text-right text-red-700 dark:text-red-400">{fmt(data.summary.total_expense)}</td>
              <td className={`px-4 py-3 text-right ${data.summary.net_result >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-700 dark:text-red-400'}`}>{fmt(data.summary.net_result)}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      {/* Categorias */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Receitas por categoria */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h4 className="font-semibold text-green-700 dark:text-green-400 mb-3">Receitas por Categoria</h4>
          <div className="space-y-2">
            {data.income_by_category.map(c => {
              const pct = data.summary.total_income > 0 ? (c.total / data.summary.total_income * 100) : 0
              return (
                <div key={c.category} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300 flex-1">{c.category}</span>
                  <span className="text-gray-400 text-xs mr-3">{pct.toFixed(1)}%</span>
                  <span className="font-medium text-green-600 w-28 text-right">{fmt(c.total)}</span>
                </div>
              )
            })}
            {data.income_by_category.length === 0 && <p className="text-gray-400 text-sm">Nenhuma receita</p>}
          </div>
        </div>

        {/* Despesas por categoria */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h4 className="font-semibold text-red-700 dark:text-red-400 mb-3">Despesas por Categoria</h4>
          <div className="space-y-2">
            {data.expense_by_category.map(c => {
              const pct = data.summary.total_expense > 0 ? (c.total / data.summary.total_expense * 100) : 0
              return (
                <div key={c.category} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300 flex-1">{c.category}</span>
                  <span className="text-gray-400 text-xs mr-3">{pct.toFixed(1)}%</span>
                  <span className="font-medium text-red-600 w-28 text-right">{fmt(c.total)}</span>
                </div>
              )
            })}
            {data.expense_by_category.length === 0 && <p className="text-gray-400 text-sm">Nenhuma despesa</p>}
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Este relatório é meramente informativo e não substitui a declaração oficial de IRPF.
      </p>
    </div>
  )
}

export default function Reports() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [dre, setDre] = useState(null)
  const [annual, setAnnual] = useState(null)
  const [cashflow, setCashflow] = useState(null)
  const [categories, setCategories] = useState([])
  const [budgets, setBudgets] = useState([])
  const [budgetModal, setBudgetModal] = useState(false)
  const [budgetForm, setBudgetForm] = useState({ category_id: '', amount: '' })
  const [editBudget, setEditBudget] = useState(null)
  const [editBudgetAmount, setEditBudgetAmount] = useState('')
  const [planning, setPlanning] = useState(null)
  const [patrimony, setPatrimony] = useState(null)
  const [incomeGoal, setIncomeGoal] = useState('')
  const [loading, setLoading] = useState(true)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [tab, setTab] = useState('dre')
  const [products, setProducts] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [cashflowAccount, setCashflowAccount] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [dreRes, annualRes, budgetsRes, catsRes, planRes, patriRes, prodRes] = await Promise.allSettled([
        api.get(`/api/reports/dre?month=${month}&year=${year}`),
        api.get(`/api/reports/annual?year=${year}`),
        api.get(`/api/reports/budgets?month=${month}&year=${year}`),
        api.get('/api/transactions/categories/list'),
        api.get(`/api/reports/planning?month=${month}&year=${year}`),
        api.get('/api/reports/patrimony?months=12'),
        api.get(`/api/reports/products?month=${month}&year=${year}`)
      ])
      if (dreRes.status === 'fulfilled') setDre(dreRes.value.data)
      if (annualRes.status === 'fulfilled') setAnnual(annualRes.value.data)
      if (budgetsRes.status === 'fulfilled') setBudgets(budgetsRes.value.data)
      if (catsRes.status === 'fulfilled') setCategories(catsRes.value.data)
      if (planRes.status === 'fulfilled') { setPlanning(planRes.value.data); setIncomeGoal(planRes.value.data?.income?.target || '') }
      if (patriRes.status === 'fulfilled') setPatrimony(patriRes.value.data)
      if (prodRes.status === 'fulfilled') setProducts(prodRes.value.data)
    } catch (err) {
      toast.error('Erro ao carregar relatórios')
    } finally {
      setLoading(false)
    }
  }

  const loadCashflow = async () => {
    try {
      const cashflowUrl = `/api/reports/cashflow?days=60${cashflowAccount ? `&account_id=${cashflowAccount}` : ''}`
      const cashRes = await api.get(cashflowUrl)
      setCashflow(cashRes.data)
    } catch {
      toast.error('Erro ao carregar fluxo de caixa')
    }
  }

  useEffect(() => { load() }, [month, year])
  useEffect(() => { loadCashflow() }, [month, year, cashflowAccount])

  const handleAddBudget = async () => {
    if (!budgetForm.category_id || !budgetForm.amount) return toast.error('Preencha todos os campos')
    try {
      await api.post('/api/reports/budgets', { ...budgetForm, month, year })
      toast.success('Meta salva!')
      setBudgetModal(false)
      load()
    } catch { toast.error('Erro ao salvar meta') }
  }

  const handleDeleteBudget = async (id) => {
    try {
      await api.delete(`/api/reports/budgets/${id}`)
      toast.success('Meta removida!')
      load()
    } catch { toast.error('Erro') }
  }

  const handleEditBudget = async () => {
    if (!editBudgetAmount || parseFloat(editBudgetAmount) <= 0) return toast.error('Valor inválido')
    try {
      await api.put(`/api/reports/budgets/${editBudget.id}`, { amount: editBudgetAmount })
      toast.success('Meta atualizada!')
      setEditBudget(null)
      load()
    } catch { toast.error('Erro ao atualizar meta') }
  }

  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const expenseCategories = categories.filter(c => c.type === 'expense')

  // Chart anual
  const annualBarData = annual ? {
    labels: annual.months.map(m => m.month_name),
    datasets: [
      { label: 'Receitas', data: annual.months.map(m => m.income), backgroundColor: '#22c55e', borderRadius: 4 },
      { label: 'Despesas', data: annual.months.map(m => m.expense), backgroundColor: '#ef4444', borderRadius: 4 },
    ]
  } : null

  // Chart cash flow: projetado (pending+completed) vs real (completed only)
  const cashflowData = cashflow?.timeline?.length > 0 ? {
    labels: cashflow.timeline.map(d => new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })),
    datasets: [
      {
        label: 'Saldo Projetado',
        data: cashflow.timeline.map(d => d.balance),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        borderDash: [5, 3],
      },
      {
        label: 'Saldo Real',
        data: cashflow.timeline.map(d => d.actual_balance ?? null),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.08)',
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        spanGaps: false,
      }
    ]
  } : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Relatórios</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Análise financeira detalhada</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
            className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {tab === 'dre' && (
            <button
              disabled={pdfLoading}
              onClick={async () => {
                const token = localStorage.getItem('fin_token')
                const baseUrl = import.meta.env.VITE_API_URL || 'https://apifinanceiro.msxsystem.site'
                setPdfLoading(true)
                try {
                  const res = await fetch(`${baseUrl}/api/reports/pdf?month=${month}&year=${year}`, { headers: { Authorization: `Bearer ${token}` } })
                  if (!res.ok) { toast.error('Erro ao gerar PDF'); return }
                  const blob = await res.blob()
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url; a.download = `dre_${year}_${String(month).padStart(2,'0')}.pdf`; a.click()
                  URL.revokeObjectURL(url)
                } catch { toast.error('Erro ao baixar PDF') }
                finally { setPdfLoading(false) }
              }}
              className="border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50 px-3 py-2 rounded-lg text-sm font-medium">
              {pdfLoading ? '⏳ Gerando...' : '📄 Exportar PDF'}
            </button>
          )}
          <button
            onClick={async () => {
              const token = localStorage.getItem('fin_token')
              const baseUrl = import.meta.env.VITE_API_URL || 'https://apifinanceiro.msxsystem.site'
              const start = `${year}-${String(month).padStart(2, '0')}-01`
              const endD = new Date(year, month, 0).toISOString().split('T')[0]
              try {
                const res = await fetch(`${baseUrl}/api/reports/export/consolidated?start_date=${start}&end_date=${endD}`, { headers: { Authorization: `Bearer ${token}` } })
                if (!res.ok) { toast.error('Erro ao exportar CSV'); return }
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = `financeiro_${start}_${endD}.csv`; a.click()
                URL.revokeObjectURL(url)
              } catch { toast.error('Erro ao baixar CSV') }
            }}
            className="border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 px-3 py-2 rounded-lg text-sm font-medium">
            📥 CSV consolidado
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 gap-1 overflow-x-auto">
        {[['dre', '📊 DRE'], ['annual', '📅 Anual'], ['cashflow', '💧 Fluxo de Caixa'], ['budgets', '🎯 Metas'], ['planning', '📋 Planejamento'], ['patrimony', '🏦 Patrimônio'], ['products', '📦 Produtos']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === key ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* DRE */}
      {!loading && tab === 'dre' && dre && (
        <div className="space-y-5">
          {/* Resultado */}
          {/* Resumo com comparativo */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Receitas', total: dre.income.total, prev: dre.income.prev_total, color: 'green', bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
              { label: 'Despesas', total: dre.expense.total, prev: dre.expense.prev_total, color: 'red', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
              { label: 'Resultado', total: dre.result, prev: dre.prev_result, color: dre.result >= 0 ? 'indigo' : 'orange', bg: dre.result >= 0 ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200' : 'bg-orange-50 border-orange-200' }
            ].map(({ label, total, prev, color, bg }) => {
              const pctChange = prev && prev !== 0 ? ((total - prev) / Math.abs(prev)) * 100 : null
              return (
                <div key={label} className={`${bg} border rounded-xl p-4 text-center`}>
                  <p className={`text-xs font-medium uppercase tracking-wide text-${color}-600 dark:text-${color}-400`}>{label}</p>
                  <p className={`text-2xl font-bold text-${color}-700 dark:text-${color}-300 mt-1`}>{fmt(total)}</p>
                  {pctChange !== null && (
                    <p className={`text-xs mt-1 ${pctChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {pctChange >= 0 ? '▲' : '▼'} {Math.abs(pctChange).toFixed(1)}% vs mês ant.
                    </p>
                  )}
                  {label === 'Resultado' && <p className={`text-xs mt-0.5 text-${color}-500`}>margem {dre.margin.toFixed(1)}%</p>}
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Receitas por categoria com comparativo */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Receitas por categoria</h3>
              {dre.income.breakdown.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Sem receitas no período</p>
              ) : (
                <div className="space-y-3">
                  {dre.income.breakdown.map((cat, i) => {
                    const chg = cat.prev_total > 0 ? ((cat.total - cat.prev_total) / cat.prev_total) * 100 : null
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 dark:text-gray-300">{cat.category}</span>
                          <div className="text-right">
                            <span className="font-semibold text-green-600">{fmt(cat.total)}</span>
                            {chg !== null && <span className={`ml-2 text-xs ${chg >= 0 ? 'text-green-500' : 'text-red-500'}`}>{chg >= 0 ? '▲' : '▼'}{Math.abs(chg).toFixed(0)}%</span>}
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${cat.pct}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 text-right mt-0.5">{cat.pct.toFixed(1)}%</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Despesas por categoria com comparativo */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Despesas por categoria</h3>
              {dre.expense.breakdown.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Sem despesas no período</p>
              ) : (
                <>
                  <div className="space-y-3 mb-4">
                    {dre.expense.breakdown.map((cat, i) => {
                      const chg = cat.prev_total > 0 ? ((cat.total - cat.prev_total) / cat.prev_total) * 100 : null
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-700 dark:text-gray-300">{cat.category}</span>
                            <div className="text-right">
                              <span className="font-semibold text-red-600">{fmt(cat.total)}</span>
                              {chg !== null && <span className={`ml-2 text-xs ${chg <= 0 ? 'text-green-500' : 'text-red-500'}`}>{chg >= 0 ? '▲' : '▼'}{Math.abs(chg).toFixed(0)}%</span>}
                            </div>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${cat.pct}%`, backgroundColor: cat.color || '#ef4444' }} />
                          </div>
                          <p className="text-xs text-gray-400 text-right mt-0.5">{cat.pct.toFixed(1)}%</p>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ maxHeight: '200px' }}>
                    <Doughnut
                      data={{
                        labels: dre.expense.breakdown.map(c => c.category),
                        datasets: [{ data: dre.expense.breakdown.map(c => c.total), backgroundColor: dre.expense.breakdown.map(c => c.color || '#ef4444'), borderWidth: 0 }]
                      }}
                      options={{ responsive: true, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } } }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Anual */}
      {!loading && tab === 'annual' && annual && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-xs text-green-600 font-medium">Total Receitas {year}</p>
              <p className="text-xl font-bold text-green-700 mt-1">{fmt(annual.totals.income)}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-xs text-red-600 font-medium">Total Despesas {year}</p>
              <p className="text-xl font-bold text-red-700 mt-1">{fmt(annual.totals.expense)}</p>
            </div>
            <div className={`${annual.totals.balance >= 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-orange-50 border-orange-200'} border rounded-xl p-4 text-center`}>
              <p className={`text-xs font-medium ${annual.totals.balance >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>Resultado {year}</p>
              <p className={`text-xl font-bold mt-1 ${annual.totals.balance >= 0 ? 'text-indigo-700' : 'text-orange-700'}`}>{fmt(annual.totals.balance)}</p>
            </div>
          </div>

          {annualBarData && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Receitas vs Despesas — {year}</h3>
              <Bar data={annualBarData} options={{
                responsive: true,
                plugins: { legend: { position: 'top' } },
                scales: { y: { beginAtZero: true, ticks: { callback: v => `R$ ${v.toLocaleString('pt-BR')}` } } }
              }} />
            </div>
          )}

          {/* Tabela mensal */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Mês</th>
                  <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Receitas</th>
                  <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Despesas</th>
                  <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {annual.months.map(m => (
                  <tr key={m.month} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-200 capitalize">{m.month_name}</td>
                    <td className="px-4 py-3 text-right text-green-600 font-medium">{m.income > 0 ? fmt(m.income) : '-'}</td>
                    <td className="px-4 py-3 text-right text-red-600 font-medium">{m.expense > 0 ? fmt(m.expense) : '-'}</td>
                    <td className={`px-4 py-3 text-right font-bold ${m.balance >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>
                      {m.income > 0 || m.expense > 0 ? fmt(m.balance) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fiscal - Relatório Anual IRPF */}
      {!loading && tab === 'fiscal' && (
        <FiscalReport year={year} />
      )}

      {/* Fluxo de caixa */}
      {!loading && tab === 'cashflow' && cashflow && (
        <div className="space-y-5">
          {/* Filtro por conta */}
          <div className="flex gap-3 items-center">
            <label className="text-sm text-gray-600 dark:text-gray-400">Conta:</label>
            <select value={cashflowAccount} onChange={e => setCashflowAccount(e.target.value)}
              className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Todas as contas</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">Saldo Atual</p>
              <p className={`text-2xl font-bold mt-1 ${cashflow.current_balance >= 0 ? 'text-indigo-700 dark:text-indigo-400' : 'text-red-600'}`}>
                {fmt(cashflow.current_balance)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">Saldo Projetado (60 dias)</p>
              <p className={`text-2xl font-bold mt-1 ${cashflow.projected_balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600'}`}>
                {fmt(cashflow.projected_balance)}
              </p>
            </div>
          </div>

          {cashflowData ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Fluxo de Caixa — Real vs Projetado (60 dias)</h3>
              <Line data={cashflowData} options={{
                responsive: true,
                plugins: { legend: { display: true, position: 'top' } },
                scales: {
                  y: { ticks: { callback: v => `R$ ${v.toLocaleString('pt-BR')}` } }
                }
              }} />
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
              <p className="text-4xl mb-2">💧</p>
              <p>Sem transações futuras para projetar</p>
              <p className="text-xs mt-1">Adicione transações com datas de vencimento futuras</p>
            </div>
          )}

          {cashflow.timeline.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <h3 className="font-semibold text-gray-700 dark:text-gray-200 text-sm">Eventos de caixa</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {cashflow.timeline.map(d => (
                  <div key={d.date} className="flex items-center gap-3 px-4 py-3 border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <span className="text-sm text-gray-500 dark:text-gray-400 w-24 shrink-0">{new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                    {d.income > 0 && <span className="text-xs text-green-600">+{fmt(d.income)}</span>}
                    {d.expense > 0 && <span className="text-xs text-red-600">-{fmt(d.expense)}</span>}
                    <span className={`ml-auto text-sm font-semibold ${d.balance >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-600'}`}>
                      {fmt(d.balance)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metas */}
      {!loading && tab === 'budgets' && (
        <div className="space-y-5">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">Metas de gastos por categoria para {months[month - 1]}/{year}</p>
            <button onClick={() => setBudgetModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              + Nova Meta
            </button>
          </div>

          {budgets.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
              <p className="text-4xl mb-2">🎯</p>
              <p>Nenhuma meta definida para este período</p>
              <p className="text-xs mt-1">Defina limites de gastos por categoria</p>
            </div>
          ) : (
            <div className="space-y-3">
              {budgets.map(b => (
                <div key={b.id} className="bg-white rounded-xl p-5 shadow-sm border dark:bg-gray-800 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-semibold text-gray-800 dark:text-white">{b.category_name}</span>
                      <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        <span>Meta: {fmt(b.amount)}</span>
                        <span>Gasto: {fmt(b.spent)}</span>
                        <span className={b.remaining >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {b.remaining >= 0 ? 'Disponível' : 'Excedido'}: {fmt(Math.abs(b.remaining))}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold ${b.pct >= 100 ? 'text-red-600' : b.pct >= 80 ? 'text-orange-500' : 'text-indigo-600'}`}>
                        {b.pct.toFixed(0)}%
                      </span>
                      <button onClick={() => { setEditBudget(b); setEditBudgetAmount(b.amount) }} className="text-indigo-400 hover:text-indigo-600 text-sm">✏️</button>
                      <button onClick={() => handleDeleteBudget(b.id)} className="text-red-400 hover:text-red-600 text-sm">🗑️</button>
                    </div>
                  </div>
                  {editBudget?.id === b.id ? (
                    <div className="flex gap-2 mt-2">
                      <MaskedInput mask="currency" value={editBudgetAmount} onValueChange={v => setEditBudgetAmount(v)}
                        className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Novo valor" />
                      <button onClick={handleEditBudget} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm">Salvar</button>
                      <button onClick={() => setEditBudget(null)} className="border dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">✕</button>
                    </div>
                  ) : (
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${b.pct >= 100 ? 'bg-red-500' : b.pct >= 80 ? 'bg-orange-400' : 'bg-indigo-500'}`}
                        style={{ width: `${Math.min(100, b.pct)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Planejamento */}
      {!loading && tab === 'planning' && planning && (
        <div className="space-y-5">
          {/* Meta de receita */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border dark:border-gray-700">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Meta de Receita — {months[month - 1]}/{year}</h3>
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Meta mensal (R$)</label>
                <MaskedInput mask="currency" value={incomeGoal}
                  onValueChange={v => setIncomeGoal(v)}
                  className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0,00" />
              </div>
              <button
                onClick={async () => {
                  try {
                    await api.post('/api/reports/planning/income-goal', { month, year, target_income: parseFloat(incomeGoal) || 0 })
                    toast.success('Meta salva!')
                    load()
                  } catch { toast.error('Erro ao salvar meta') }
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Salvar Meta
              </button>
            </div>
            {planning.income?.target > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Realizado: {fmt(planning.income?.actual)}</span>
                  <span className="text-gray-600 dark:text-gray-400">Meta: {fmt(planning.income?.target)}</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3">
                  <div className={`h-3 rounded-full transition-all ${planning.income?.pct >= 100 ? 'bg-green-500' : planning.income?.pct >= 70 ? 'bg-indigo-500' : 'bg-orange-400'}`}
                    style={{ width: `${Math.min(100, planning.income?.pct || 0)}%` }} />
                </div>
                <p className="text-sm mt-1">
                  <span className={`font-semibold ${planning.income?.pct >= 100 ? 'text-green-600' : 'text-indigo-600'}`}>
                    {(planning.income?.pct || 0).toFixed(1)}% atingido
                  </span>
                  <span className="text-gray-500 ml-2">
                    {planning.income?.pct < 100
                      ? `Faltam ${fmt(planning.income?.diff * -1)}`
                      : `Superou em ${fmt(planning.income?.diff)}`}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Resumo do mês */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
              <p className="text-xs text-green-600 font-medium">Receitas</p>
              <p className="text-xl font-bold text-green-700 dark:text-green-400 mt-1">{fmt(planning.income?.actual)}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
              <p className="text-xs text-red-600 font-medium">Despesas</p>
              <p className="text-xl font-bold text-red-700 dark:text-red-400 mt-1">{fmt(planning.expense?.actual)}</p>
            </div>
            <div className={`${planning.result?.actual >= 0 ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'} border rounded-xl p-4 text-center`}>
              <p className={`text-xs font-medium ${planning.result?.actual >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>Resultado</p>
              <p className={`text-xl font-bold mt-1 ${planning.result?.actual >= 0 ? 'text-indigo-700 dark:text-indigo-400' : 'text-orange-700 dark:text-orange-400'}`}>
                {fmt(planning.result?.actual)}
              </p>
            </div>
          </div>

          {/* Metas de gastos */}
          {planning.budgets?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Metas de Gastos</h3>
              <div className="space-y-3">
                {planning.budgets.map(b => (
                  <div key={b.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300">{b.category_name}</span>
                      <span className={`font-medium ${b.pct >= 100 ? 'text-red-600' : b.pct >= 80 ? 'text-orange-500' : 'text-green-600'}`}>
                        {fmt(b.spent)} / {fmt(b.amount)} ({b.pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                      <div className={`h-2 rounded-full ${b.pct >= 100 ? 'bg-red-500' : b.pct >= 80 ? 'bg-orange-400' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(100, b.pct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Patrimônio */}
      {!loading && tab === 'patrimony' && patrimony && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">Patrimônio Atual</p>
              <p className={`text-2xl font-bold mt-1 ${patrimony.current_patrimony >= 0 ? 'text-indigo-700 dark:text-indigo-400' : 'text-red-600'}`}>
                {fmt(patrimony.current_patrimony)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">saldo acumulado</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">Variação (12 meses)</p>
              {patrimony.timeline?.length >= 2 && (() => {
                const first = parseFloat(patrimony.timeline[0]?.cumulative || 0)
                const last = parseFloat(patrimony.timeline[patrimony.timeline.length - 1]?.cumulative || 0)
                const delta = last - first
                return (
                  <p className={`text-2xl font-bold mt-1 ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {delta >= 0 ? '+' : ''}{fmt(delta)}
                  </p>
                )
              })()}
            </div>
          </div>

          {patrimony.timeline?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Evolução do Patrimônio</h3>
              <Line
                data={{
                  labels: patrimony.timeline.map(m => m.month_name),
                  datasets: [{
                    label: 'Patrimônio Acumulado',
                    data: patrimony.timeline.map(m => parseFloat(m.cumulative)),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#6366f1'
                  }]
                }}
                options={{
                  responsive: true,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { ticks: { callback: v => `R$ ${v.toLocaleString('pt-BR')}` } }
                  }
                }}
              />
            </div>
          )}

          {/* Tabela mensal */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Mês</th>
                  <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Receitas</th>
                  <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Despesas</th>
                  <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Resultado</th>
                  <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Patrimônio</th>
                </tr>
              </thead>
              <tbody>
                {patrimony.timeline.map((m, i) => (
                  <tr key={i} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">{m.month_name}</td>
                    <td className="px-4 py-3 text-right text-green-600">{parseFloat(m.income) > 0 ? fmt(m.income) : '-'}</td>
                    <td className="px-4 py-3 text-right text-red-600">{parseFloat(m.expense) > 0 ? fmt(m.expense) : '-'}</td>
                    <td className={`px-4 py-3 text-right font-medium ${parseFloat(m.balance) >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>
                      {fmt(m.balance)}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${parseFloat(m.cumulative) >= 0 ? 'text-gray-800 dark:text-gray-200' : 'text-red-600'}`}>
                      {fmt(m.cumulative)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lucratividade por produto */}
      {!loading && tab === 'products' && products && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
              <p className="text-xs text-green-600 dark:text-green-400 font-medium uppercase tracking-wide">Receita</p>
              <p className="text-xl font-bold text-green-700 dark:text-green-300 mt-1">{fmt(products.totals.revenue)}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium uppercase tracking-wide">Custo</p>
              <p className="text-xl font-bold text-red-700 dark:text-red-300 mt-1">{fmt(products.totals.cost)}</p>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 text-center">
              <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-wide">Lucro</p>
              <p className="text-xl font-bold text-indigo-700 dark:text-indigo-300 mt-1">{fmt(products.totals.profit)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium uppercase tracking-wide">Qtd. Vendida</p>
              <p className="text-xl font-bold text-gray-700 dark:text-gray-300 mt-1">{products.totals.qty_sold.toFixed(0)}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">Produtos — {new Date(products.period.year, products.period.month - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
            </div>
            {products.products.length === 0 ? (
              <div className="text-center py-12 text-gray-400">Nenhum produto vendido no período</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Produto</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Qtd.</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Receita</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium hidden md:table-cell">Custo</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Lucro</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium hidden sm:table-cell">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {products.products.map(p => (
                    <tr key={p.id} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 dark:text-white">{p.name}</p>
                        <p className="text-xs text-gray-400">Preço: {fmt(p.price)}{p.unit_cost > 0 ? ` · Custo unit.: ${fmt(p.unit_cost)}` : ''}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{p.qty_sold.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-600 dark:text-green-400">{fmt(p.revenue)}</td>
                      <td className="px-4 py-3 text-right text-red-600 dark:text-red-400 hidden md:table-cell">{p.cost > 0 ? fmt(p.cost) : '—'}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${p.profit >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-600'}`}>{fmt(p.profit)}</td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${p.margin >= 30 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : p.margin >= 10 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {p.margin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal nova meta */}
      <Modal open={budgetModal} onClose={() => setBudgetModal(false)} title="Nova Meta de Gasto" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <select value={budgetForm.category_id} onChange={e => setBudgetForm(p => ({ ...p, category_id: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Selecione...</option>
              {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Limite (R$)</label>
            <MaskedInput mask="currency" value={budgetForm.amount} onValueChange={v => setBudgetForm(p => ({ ...p, amount: v }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="0,00" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setBudgetModal(false)} className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            <button onClick={handleAddBudget} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium">Salvar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
