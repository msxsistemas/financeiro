import { useState, useEffect, useCallback } from 'react'
import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import api from '../api'
import toast from 'react-hot-toast'

ChartJS.register(ArcElement, Tooltip, Legend)

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

export default function Delinquents() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notifying, setNotifying] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [expandedKey, setExpandedKey] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/delinquents')
      setData(res.data)
    } catch {
      toast.error('Erro ao carregar inadimplentes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const exportCSV = () => {
    if (!data?.summary?.length) return
    const rows = [['Nome', 'Telefone', 'Itens', 'Dívidas', 'Empréstimos', 'Total']]
    data.summary.forEach(d => {
      rows.push([d.contact_name || '', d.contact_phone || '', d.items_count, d.total_debt || 0, d.total_loan || 0, d.total])
    })
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'inadimplentes.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const downloadPDF = async () => {
    setPdfLoading(true)
    try {
      const token = localStorage.getItem('fin_token')
      const res = await fetch('/api/delinquents/pdf', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Erro ao gerar PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'inadimplentes.pdf'; a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erro ao gerar PDF')
    } finally {
      setPdfLoading(false)
    }
  }

  const notifyAll = async () => {
    setNotifying(true)
    try {
      const res = await api.post('/api/delinquents/notify-all')
      toast.success(`${res.data.sent} mensagens enviadas${res.data.errors > 0 ? `, ${res.data.errors} erros` : ''}`)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao enviar notificações')
    } finally {
      setNotifying(false)
    }
  }

  const [notifyingKey, setNotifyingKey] = useState(null)
  const notifyOne = async (debtor, key) => {
    if (!debtor.contact_phone) {
      toast.error('Devedor sem telefone cadastrado')
      return
    }
    setNotifyingKey(key)
    let sent = 0, errors = 0
    for (const item of debtor.items) {
      try {
        if (item.source === 'debt') {
          await api.post(`/api/whatsapp/notify-debt/${item.id}`)
        } else {
          await api.post(`/api/loans/installments/${item.id}/notify`)
        }
        sent += 1
      } catch {
        errors += 1
      }
    }
    setNotifyingKey(null)
    if (sent > 0) toast.success(`${sent} mensagem(ns) enviada(s)${errors > 0 ? ` • ${errors} erro(s)` : ''}`)
    else toast.error('Não foi possível enviar a cobrança')
  }

  const daysLabel = (days) => {
    if (days <= 0) return 'Vence hoje'
    if (days === 1) return '1 dia'
    return `${days} dias`
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Painel de Inadimplentes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Devedores com obrigações vencidas (dívidas + empréstimos)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            disabled={!data?.debtors_count}
            className="flex items-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            📥 CSV
          </button>
          <button
            onClick={downloadPDF}
            disabled={pdfLoading || !data?.debtors_count}
            className="flex items-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {pdfLoading ? '⏳' : '📄'} PDF
          </button>
          <button
            onClick={notifyAll}
            disabled={notifying || !data?.debtors_count}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {notifying ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <span>💬</span>
            )}
            Cobrar Todos via WhatsApp
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total em Aberto</p>
          <p className="text-xl font-bold text-red-600 mt-1">{fmt(data?.grand_total)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Devedores</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{data?.debtors_count || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Dívidas Vencidas</p>
          <p className="text-xl font-bold text-orange-600 mt-1">{data?.debts_count || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Parcelas Vencidas</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{data?.loans_count || 0}</p>
        </div>
      </div>

      {/* Charts row */}
      {data?.debtors_count > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Composição das Dívidas</h3>
            <div className="max-w-[220px] mx-auto">
              <Doughnut
                data={{
                  labels: ['Dívidas', 'Parcelas de Empréstimos'],
                  datasets: [{
                    data: [data.debts_count || 0, data.loans_count || 0],
                    backgroundColor: ['#f97316', '#8b5cf6'],
                    borderWidth: 0
                  }]
                }}
                options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }}
              />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Valores por Tipo</h3>
            <div className="max-w-[220px] mx-auto">
              <Doughnut
                data={{
                  labels: ['Dívidas', 'Parcelas de Empréstimos'],
                  datasets: [{
                    data: [
                      data?.summary?.reduce((s, d) => s + parseFloat(d.total_debt || 0), 0) || 0,
                      data?.summary?.reduce((s, d) => s + parseFloat(d.total_loan || 0), 0) || 0
                    ],
                    backgroundColor: ['#f97316', '#8b5cf6'],
                    borderWidth: 0
                  }]
                }}
                options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (ctx) => fmt(ctx.raw) } } } }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Debtors list */}
      {data?.summary?.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <p className="text-4xl mb-3">🎉</p>
          <p className="text-gray-600 dark:text-gray-300 font-medium">Nenhum inadimplente encontrado!</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Todos os pagamentos estão em dia.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.summary?.map((debtor, idx) => {
            const key = debtor.contact_phone || debtor.contact_name || idx
            const isExpanded = expandedKey === key
            return (
              <div key={key} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center shrink-0">
                      <span className="text-red-600 dark:text-red-400 font-bold text-sm">
                        {(debtor.contact_name || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="text-left min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">
                        {debtor.contact_name || 'Sem nome'}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        {debtor.contact_phone && <span>📱 {debtor.contact_phone}</span>}
                        <span>{debtor.items_count} item(s)</span>
                        <span>Mais antigo: {debtor.oldest_due ? new Date(String(debtor.oldest_due).substring(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      {debtor.total_debt > 0 && (
                        <p className="text-sm text-orange-600 dark:text-orange-400">Dívidas: {fmt(debtor.total_debt)}</p>
                      )}
                      {debtor.total_loan > 0 && (
                        <p className="text-sm text-purple-600 dark:text-purple-400">Empréstimos: {fmt(debtor.total_loan)}</p>
                      )}
                      <p className="font-bold text-red-600 dark:text-red-400">{fmt(debtor.total)}</p>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); notifyOne(debtor, key) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); notifyOne(debtor, key) } }}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${debtor.contact_phone ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'} ${notifyingKey === key ? 'opacity-60' : ''}`}
                      title={debtor.contact_phone ? 'Enviar cobrança via WhatsApp' : 'Sem telefone cadastrado'}
                    >
                      {notifyingKey === key ? '⏳' : '💬 Cobrar'}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                    {debtor.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            item.source === 'debt'
                              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                              : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                          }`}>
                            {item.source === 'debt' ? 'Dívida' : `Parcela ${item.installment_number}`}
                          </span>
                          <span className="text-gray-700 dark:text-gray-300">
                            {item.description || item.contact_name || '-'}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900 dark:text-white">{fmt(item.remaining)}</p>
                          <p className="text-xs text-red-500 dark:text-red-400">
                            Venceu há {daysLabel(item.days_overdue)} —{' '}
                            {item.due_date ? new Date(String(item.due_date).substring(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
