import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import api from '../api'
import { formatDateTimeBR } from '../utils/masks'

const fmtBytes = (n) => {
  if (!n) return '—'
  if (n > 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n > 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024).toFixed(0)} KB`
}

const defaultForm = { name: '', email: '', password: '', role: 'user' }

export default function Admin() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('users')
  const [search, setSearch] = useState('')
  const [forbidden, setForbidden] = useState(false)

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)

  const [pwModal, setPwModal] = useState(null)
  const [newPassword, setNewPassword] = useState('')

  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('fin_user') || '{}') } catch { return {} } })()

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/stats')
      setStats(data)
    } catch (e) {
      if (e.response?.status === 403) setForbidden(true)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      const { data } = await api.get(`/api/admin/users?${params}`)
      setUsers(data.data || [])
    } catch (e) {
      if (e.response?.status === 403) setForbidden(true)
    }
  }, [search])

  const loadActivity = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/activity?limit=100')
      setActivity(data.data || [])
    } catch {}
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadStats(), loadUsers(), loadActivity()]).finally(() => setLoading(false))
  }, [loadStats, loadUsers, loadActivity])

  if (forbidden) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-8 border border-red-200 dark:border-red-800 text-center">
        <p className="text-5xl mb-3">🔒</p>
        <h2 className="text-xl font-bold text-red-600 mb-2">Acesso restrito</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4">Este painel é exclusivo para administradores.</p>
        <button onClick={() => navigate('/')}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          Voltar ao Dashboard
        </button>
      </div>
    )
  }

  const openCreate = () => { setEditing(null); setForm(defaultForm); setModal(true) }
  const openEdit = (u) => {
    setEditing(u)
    setForm({ name: u.name, email: u.email, password: '', role: u.role })
    setModal(true)
  }

  const save = async () => {
    if (!form.name || !form.email) return toast.error('Nome e email são obrigatórios')
    if (!editing && (!form.password || form.password.length < 6)) {
      return toast.error('Senha obrigatória (mínimo 6 caracteres)')
    }
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/api/admin/users/${editing.id}`, {
          name: form.name, email: form.email, role: form.role
        })
        toast.success('Usuário atualizado')
      } else {
        await api.post('/api/admin/users', form)
        toast.success('Usuário criado')
      }
      setModal(false)
      loadUsers()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const toggleActive = async (u) => {
    try {
      await api.put(`/api/admin/users/${u.id}`, { active: !u.active })
      toast.success(u.active ? 'Conta desativada' : 'Conta ativada')
      loadUsers()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
  }

  const resetPw = async () => {
    if (!newPassword || newPassword.length < 6) return toast.error('Senha mínima 6 caracteres')
    try {
      await api.post(`/api/admin/users/${pwModal.id}/reset-password`, { password: newPassword })
      toast.success('Senha resetada — usuário será obrigado a trocar no próximo login')
      setPwModal(null)
      setNewPassword('')
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/api/admin/users/${deleteConfirm.id}`)
      toast.success('Usuário removido')
      setDeleteConfirm(null)
      loadUsers()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🛡️ Painel Admin</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Gerenciamento de usuários e visão global do sistema</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard label="Usuários" value={stats.users?.total} sub={`${stats.users?.active} ativos`} />
          <StatCard label="Transações" value={stats.transactions} />
          <StatCard label="Dívidas" value={stats.debts} />
          <StatCard label="Empréstimos" value={stats.loans} />
          <StatCard label="Clientes IPTV" value={stats.iptv_clients} />
          <StatCard label="Banco" value={fmtBytes(stats.db_size_bytes)} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap border-b border-gray-200 dark:border-gray-700">
        {[['users', '👥 Usuários'], ['activity', '📜 Atividade']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === k
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou email..."
              className="flex-1 min-w-[200px] border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={openCreate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              + Novo usuário
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400">Carregando...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-gray-400 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
              Nenhum usuário encontrado
            </div>
          ) : (
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id}
                  className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border ${u.active === false ? 'border-red-200 opacity-60' : 'border-gray-100 dark:border-gray-700'}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{u.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.role === 'admin'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                          {u.role === 'admin' ? '👑 Admin' : 'Usuário'}
                        </span>
                        {u.active === false && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Desativado</span>
                        )}
                        {u.must_change_password && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Troca pendente</span>
                        )}
                        {u.totp_enabled && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">2FA</span>
                        )}
                        {u.id === currentUser.id && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">Você</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{u.email}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1">
                        <span>Criado: {formatDateTimeBR(u.created_at)}</span>
                        {u.last_login_at && <span>Último login: {formatDateTimeBR(u.last_login_at)}</span>}
                        <span>{u.transactions_count} transações · {u.debts_count} dívidas</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setPwModal(u)}
                        className="text-xs text-yellow-700 hover:text-yellow-900 px-2 py-1">🔑 Resetar senha</button>
                      <button onClick={() => toggleActive(u)}
                        disabled={u.id === currentUser.id}
                        className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 disabled:opacity-40">
                        {u.active === false ? '▶ Ativar' : '⏸ Desativar'}
                      </button>
                      <button onClick={() => openEdit(u)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1">✏️ Editar</button>
                      <button onClick={() => setDeleteConfirm(u)}
                        disabled={u.id === currentUser.id}
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1 disabled:opacity-40">🗑️</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700">
          {activity.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Sem atividades registradas</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Usuário</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Ação</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Descrição</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {activity.map(a => (
                  <tr key={a.id} className="border-b dark:border-gray-700 last:border-0">
                    <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{a.user_name || '—'}</td>
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
          )}
        </div>
      )}

      {/* Modal criar/editar */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar usuário' : 'Novo usuário'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          {!editing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Senha provisória * <span className="text-xs text-gray-400">· usuário será obrigado a trocar</span>
              </label>
              <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Papel</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="user">Usuário (acesso padrão)</option>
              <option value="admin">Admin (acesso total)</option>
              <option value="operator">Operador</option>
              <option value="viewer">Viewer (apenas leitura)</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)}
              className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button onClick={save} disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal reset senha */}
      <Modal open={!!pwModal} onClose={() => { setPwModal(null); setNewPassword('') }}
        title={`Resetar senha · ${pwModal?.email || ''}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            A nova senha será marcada como provisória — o usuário terá que trocá-la no próximo login.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nova senha</label>
            <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setPwModal(null); setNewPassword('') }}
              className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button onClick={resetPw}
              className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg text-sm font-medium">
              Resetar
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover usuário"
        message={`Remover permanentemente "${deleteConfirm?.email}"? Todos os dados do usuário serão perdidos.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        confirmLabel="Remover"
      />
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
