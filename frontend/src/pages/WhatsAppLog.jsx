import { useState, useEffect, useCallback } from 'react'
import api from '../api'
import toast from 'react-hot-toast'

const statusColor = {
  sent: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

const sourceLabel = { delinquents: 'Inadimplentes', loan: 'Empréstimo', debt: 'Dívida', manual: 'Manual' }

export default function WhatsAppLog() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ source: '', status: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 50 })
      if (filters.source) params.set('source', filters.source)
      if (filters.status) params.set('status', filters.status)
      const { data: res } = await api.get(`/api/whatsapp-log?${params}`)
      setData(res)
    } catch {
      toast.error('Erro ao carregar histórico')
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/whatsapp-log/${id}`)
      load()
    } catch { toast.error('Erro ao remover') }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Histórico WhatsApp</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {data?.total || 0} mensagens enviadas
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <select value={filters.source} onChange={e => setFilters(p => ({ ...p, source: e.target.value }))}
          className="border dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todas as origens</option>
          <option value="delinquents">Inadimplentes</option>
          <option value="loan">Empréstimo</option>
          <option value="debt">Dívida</option>
        </select>
        <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}
          className="border dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todos os status</option>
          <option value="sent">Enviado</option>
          <option value="failed">Falhou</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data?.data?.length ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-12 text-center">
          <p className="text-4xl mb-3">💬</p>
          <p className="text-gray-600 dark:text-gray-300 font-medium">Nenhuma mensagem registrada</p>
          <p className="text-gray-400 text-sm mt-1">As mensagens enviadas via WhatsApp aparecerão aqui.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Destinatário</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium hidden md:table-cell">Mensagem</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Origem</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium hidden sm:table-cell">Data</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.data.map(log => (
                <tr key={log.id} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 dark:text-white">{log.contact_name || '—'}</p>
                    <p className="text-xs text-gray-400">{log.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell max-w-xs">
                    <p className="truncate">{log.message}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded">
                      {sourceLabel[log.source] || log.source || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[log.status]}`}>
                      {log.status === 'sent' ? '✓ Enviado' : '✗ Falhou'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(log.id)} className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data?.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 border dark:border-gray-600 dark:text-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">← Ant</button>
          <span className="text-sm text-gray-500 dark:text-gray-400">Pág. {page} de {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 border dark:border-gray-600 dark:text-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">Próx →</button>
        </div>
      )}
    </div>
  )
}
