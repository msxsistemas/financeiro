import { useState, useEffect } from 'react'
import api from '../../api'
import { formatDateTimeBR } from '../../utils/masks'

const fmtBytes = (n) => {
  if (!n) return '—'
  if (n > 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n > 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024).toFixed(0)} KB`
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/admin/stats').then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-gray-400 text-center py-8">Carregando…</p>
  if (!stats) return <p className="text-red-500 text-center py-8">Não foi possível carregar os dados</p>

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Visão geral do sistema</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Dashboard consolidado do painel admin</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Usuários" value={stats.users?.total} sub={`${stats.users?.active} ativos`} />
        <StatCard label="Transações" value={stats.transactions} />
        <StatCard label="Dívidas" value={stats.debts} />
        <StatCard label="Empréstimos" value={stats.loans} />
        <StatCard label="Clientes IPTV" value={stats.iptv_clients} />
        <StatCard label="Banco" value={fmtBytes(stats.db_size_bytes)} />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Logs recentes</h3>
          <a href="/admin/activity" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">ver todos →</a>
        </div>
        {(stats.recent_activity || []).length === 0 ? (
          <p className="p-6 text-center text-gray-400">Sem atividade recente</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Usuário</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Ação</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium hidden md:table-cell">Descrição</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Quando</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_activity.map(a => (
                <tr key={a.id} className="border-b dark:border-gray-700 last:border-0">
                  <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{a.user_name || '—'}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded">
                      {a.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden md:table-cell truncate max-w-xs">{a.description}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">{formatDateTimeBR(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value ?? 0}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}
