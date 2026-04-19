import { Outlet, Navigate } from 'react-router-dom'
import AdminSidebar from './AdminSidebar'

export default function AdminLayout() {
  const token = localStorage.getItem('fin_token')
  if (!token) return <Navigate to="/login" replace />

  const user = (() => { try { return JSON.parse(localStorage.getItem('fin_user') || '{}') } catch { return {} } })()
  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 border border-red-200 dark:border-red-800 text-center max-w-md">
          <p className="text-5xl mb-3">🔒</p>
          <h2 className="text-xl font-bold text-red-600 mb-2">Acesso restrito</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Esta área é exclusiva para administradores.
          </p>
          <a href="/" className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            Voltar ao app
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="lg:hidden h-14" />
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
