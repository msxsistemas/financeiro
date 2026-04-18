import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '../api'

const entityLabel = {
  transaction: '💰 Transação', debt: '📋 Dívida', product: '📦 Produto',
  whatsapp: '💬 WhatsApp', calendar_event: '📅 Evento', user: '👤 Usuário'
}
const actionLabel = {
  CREATE: 'Criado', UPDATE: 'Atualizado', DELETE: 'Removido',
  LOGIN: 'Login', PAYMENT: 'Pagamento', STOCK: 'Estoque',
  WHATSAPP_SEND: 'Mensagem enviada', WHATSAPP_DEBT_NOTIFY: 'Notificação de dívida'
}
const actionColor = {
  CREATE: 'bg-green-100 text-green-700', UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700', LOGIN: 'bg-gray-100 text-gray-600',
  PAYMENT: 'bg-emerald-100 text-emerald-700', STOCK: 'bg-yellow-100 text-yellow-700',
  WHATSAPP_SEND: 'bg-teal-100 text-teal-700', WHATSAPP_DEBT_NOTIFY: 'bg-teal-100 text-teal-700'
}

export default function History() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ entity: '', action: '', start_date: '', end_date: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 30 })
      if (filters.entity) params.set('entity', filters.entity)
      if (filters.action) params.set('action', filters.action)
      if (filters.start_date) params.set('start_date', filters.start_date)
      if (filters.end_date) params.set('end_date', filters.end_date)
      const { data } = await api.get(`/api/history?${params}`)
      setItems(data.data)
      setTotal(data.total)
      setPages(data.pages)
    } catch { toast.error('Erro ao carregar histórico') }
    finally { setLoading(false) }
  }, [page, filters])

  useEffect(() => { load() }, [load])

  const groupByDate = (items) => {
    const groups = {}
    items.forEach(item => {
      const date = new Date(item.created_at).toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long'
      })
      if (!groups[date]) groups[date] = []
      groups[date].push(item)
    })
    return groups
  }

  const grouped = groupByDate(items)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Histórico</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{total} atividades registradas</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <select value={filters.entity} onChange={e => setFilters(p => ({ ...p, entity: e.target.value }))}
          className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todos os módulos</option>
          <option value="transaction">Transações</option>
          <option value="debt">Dívidas</option>
          <option value="product">Produtos</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="calendar_event">Agenda</option>
        </select>
        <select value={filters.action} onChange={e => setFilters(p => ({ ...p, action: e.target.value }))}
          className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todas as ações</option>
          <option value="CREATE">Criado</option>
          <option value="UPDATE">Atualizado</option>
          <option value="DELETE">Removido</option>
          <option value="PAYMENT">Pagamento</option>
          <option value="STOCK">Estoque</option>
        </select>
        <input type="date" value={filters.start_date} onChange={e => setFilters(p => ({ ...p, start_date: e.target.value }))}
          className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <input type="date" value={filters.end_date} onChange={e => setFilters(p => ({ ...p, end_date: e.target.value }))}
          className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      {/* Timeline */}
      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-12 text-gray-400 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
          <p className="text-4xl mb-2">🕒</p>
          <p>Nenhuma atividade registrada</p>
        </div>
      )}

      {!loading && Object.entries(grouped).map(([date, activities]) => (
        <div key={date}>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 capitalize">{date}</span>
            <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            {activities.map((item, i) => (
              <div key={item.id} className={`flex items-start gap-4 px-5 py-4 ${i < activities.length - 1 ? 'border-b dark:border-gray-700' : ''}`}>
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-sm">
                    {entityLabel[item.entity]?.split(' ')[0] || '📝'}
                  </div>
                  {i < activities.length - 1 && <div className="w-px h-full bg-gray-100 dark:bg-gray-700 mt-1" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actionColor[item.action] || 'bg-gray-100 text-gray-600'}`}>
                      {actionLabel[item.action] || item.action}
                    </span>
                    {item.entity && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{entityLabel[item.entity] || item.entity}</span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
                      {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{item.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 border dark:border-gray-600 rounded text-sm disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">← Ant</button>
          <span className="text-sm text-gray-600 dark:text-gray-400">{page} / {pages}</span>
          <button disabled={page === pages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 border dark:border-gray-600 rounded text-sm disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">Próx →</button>
        </div>
      )}
    </div>
  )
}
