import { useState, useEffect } from 'react'
import api from '../../api'
import { formatDateTimeBR } from '../../utils/masks'

export default function AdminActivity() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/api/admin/activity?limit=100&page=${page}`)
      .then(r => { setItems(r.data.data || []); setTotal(r.data.total || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Logs do sistema</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">{total} eventos registrados (logins, criações, alterações, remoções e erros)</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700">
        {loading ? (
          <p className="text-center py-8 text-gray-400">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-center py-8 text-gray-400">Sem atividade</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Usuário</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Ação</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Descrição</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Quando</th>
              </tr>
            </thead>
            <tbody>
              {items.map(a => (
                <tr key={a.id} className="border-b dark:border-gray-700 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="text-gray-800 dark:text-gray-200">{a.user_name || '—'}</div>
                    <div className="text-xs text-gray-400">{a.user_email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded">
                      {a.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden md:table-cell truncate max-w-xs">{a.description}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{formatDateTimeBR(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {total > 100 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 border dark:border-gray-600 rounded text-sm disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">← Ant</button>
          <span className="text-sm text-gray-500 dark:text-gray-400 px-2">pág. {page}</span>
          <button disabled={items.length < 100} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 border dark:border-gray-600 rounded text-sm disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">Próx →</button>
        </div>
      )}
    </div>
  )
}
