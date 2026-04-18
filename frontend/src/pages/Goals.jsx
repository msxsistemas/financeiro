import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'
import api from '../api'

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const ICONS = ['🎯', '🏠', '✈️', '🚗', '💍', '🎓', '💻', '📱', '🏖️', '💰', '🛡️', '🎁']
const COLORS = ['#22c55e', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#14b8a6', '#0ea5e9']

const defaultForm = { name: '', target_amount: '', current_amount: '', deadline: '', color: '#22c55e', icon: '🎯', notes: '' }

export default function Goals() {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [depositModal, setDepositModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [depositForm, setDepositForm] = useState({ amount: '', type: 'deposit' })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/goals')
      setGoals(data)
    } catch { toast.error('Erro ao carregar metas') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const active = goals.filter(g => !g.completed)
  const completed = goals.filter(g => g.completed)
  const totalTarget = active.reduce((s, g) => s + parseFloat(g.target_amount), 0)
  const totalSaved = active.reduce((s, g) => s + parseFloat(g.current_amount), 0)

  const openCreate = () => { setEditing(null); setForm(defaultForm); setModal(true) }
  const openEdit = (g) => {
    setEditing(g)
    setForm({ name: g.name, target_amount: g.target_amount, current_amount: g.current_amount,
      deadline: g.deadline ? g.deadline.split('T')[0] : '', color: g.color, icon: g.icon, notes: g.notes || '' })
    setModal(true)
  }

  const openDeposit = (g) => { setSelected(g); setDepositForm({ amount: '', type: 'deposit' }); setDepositModal(true) }

  const handleSave = async () => {
    if (!form.name || !form.target_amount) return toast.error('Nome e valor são obrigatórios')
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/api/goals/${editing.id}`, form)
        toast.success('Meta atualizada!')
      } else {
        await api.post('/api/goals', form)
        toast.success('Meta criada!')
      }
      setModal(false); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const handleDeposit = async () => {
    if (!depositForm.amount || parseFloat(depositForm.amount) <= 0) return toast.error('Valor inválido')
    setSaving(true)
    try {
      const endpoint = depositForm.type === 'deposit' ? 'deposit' : 'withdraw'
      await api.post(`/api/goals/${selected.id}/${endpoint}`, { amount: parseFloat(depositForm.amount) })
      toast.success(depositForm.type === 'deposit' ? 'Valor adicionado!' : 'Valor retirado!')
      setDepositModal(false); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    await api.delete(`/api/goals/${id}`)
    toast.success('Meta removida'); setDeleteConfirm(null); load()
  }

  const daysLeft = (deadline) => {
    if (!deadline) return null
    const diff = Math.ceil((new Date(String(deadline).substring(0, 10) + 'T12:00:00') - new Date()) / (1000 * 60 * 60 * 24))
    return diff
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const GoalCard = ({ g }) => {
    const target = parseFloat(g.target_amount)
    const current = parseFloat(g.current_amount)
    const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0
    const days = daysLeft(g.deadline)
    const remaining = target - current

    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 shadow-sm p-5 ${g.completed ? 'opacity-75' : ''}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl" style={{ backgroundColor: g.color + '22' }}>
              {g.icon}
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">{g.name}</p>
              {g.completed ? (
                <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">✓ Concluída</span>
              ) : days !== null && (
                <span className={`text-xs ${days < 0 ? 'text-red-500' : days < 30 ? 'text-orange-500' : 'text-gray-400'}`}>
                  {days < 0 ? `${Math.abs(days)}d atrasada` : `${days}d restantes`}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            {!g.completed && (
              <button onClick={() => openDeposit(g)} className="text-green-600 hover:text-green-800 text-sm p-1" title="Depositar/Retirar">💰</button>
            )}
            <button onClick={() => openEdit(g)} className="text-gray-400 hover:text-indigo-600 text-sm p-1">✏️</button>
            <button onClick={() => setDeleteConfirm(g)} className="text-gray-400 hover:text-red-500 text-sm p-1">🗑️</button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Guardado</span>
            <span className="font-semibold" style={{ color: g.color }}>{fmt(current)}</span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3">
            <div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: g.color }} />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>{pct.toFixed(1)}%</span>
            <span>Meta: {fmt(target)}</span>
          </div>
          {!g.completed && remaining > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Faltam {fmt(remaining)}</p>
          )}
          {g.notes && <p className="text-xs text-gray-400 italic truncate">{g.notes}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🎯 Metas de Economia</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {active.length} ativas · Guardado: <span className="text-green-600 font-medium">{fmt(totalSaved)}</span> / {fmt(totalTarget)}
          </p>
        </div>
        <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Nova Meta
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : goals.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 text-gray-400">
          <p className="text-5xl mb-3">🎯</p>
          <p className="font-medium">Nenhuma meta criada</p>
          <p className="text-sm mt-1">Defina objetivos financeiros com prazos e acompanhe o progresso</p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Em andamento</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {active.map(g => <GoalCard key={g.id} g={g} />)}
              </div>
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Concluídas</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {completed.map(g => <GoalCard key={g.id} g={g} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal criar/editar */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar Meta' : 'Nova Meta de Economia'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
            <input value={form.name} onChange={e => f('name', e.target.value)}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: Viagem para Europa, Entrada do apartamento..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor alvo (R$) *</label>
              <MaskedInput mask="currency" value={form.target_amount} onValueChange={v => f('target_amount', v)}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0,00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Já guardei (R$)</label>
              <MaskedInput mask="currency" value={form.current_amount} onValueChange={v => f('current_amount', v)}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0,00" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prazo</label>
            <input type="date" value={form.deadline} onChange={e => f('deadline', e.target.value)}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ícone</label>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map(ic => (
                <button key={ic} type="button" onClick={() => f('icon', ic)}
                  className={`text-2xl p-2 rounded-lg border-2 transition-colors ${form.icon === ic ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-transparent hover:border-gray-300'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cor</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => f('color', c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observações</label>
            <input value={form.notes} onChange={e => f('notes', e.target.value)}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Opcional" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal depósito/retirada */}
      <Modal open={depositModal} onClose={() => setDepositModal(false)} title={`💰 ${selected?.name || ''}`} size="sm">
        {selected && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Guardado</span>
                <span className="font-bold" style={{ color: selected.color }}>{fmt(selected.current_amount)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500 dark:text-gray-400">Meta</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">{fmt(selected.target_amount)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[['deposit', '+ Adicionar'], ['withdraw', '− Retirar']].map(([v, l]) => (
                <button key={v} onClick={() => setDepositForm(p => ({ ...p, type: v }))}
                  className={`py-2 rounded-lg text-sm font-medium border-2 transition-colors ${depositForm.type === v
                    ? v === 'deposit' ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  {l}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor (R$)</label>
              <MaskedInput mask="currency" value={depositForm.amount} onValueChange={v => setDepositForm(p => ({ ...p, amount: v }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0,00" autoFocus />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDepositModal(false)} className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button onClick={handleDeposit} disabled={saving}
                className={`flex-1 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium ${depositForm.type === 'deposit' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'}`}>
                {saving ? '...' : depositForm.type === 'deposit' ? 'Adicionar' : 'Retirar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover meta"
        message={`Deseja remover "${deleteConfirm?.name}"? Todo o histórico de depósitos será perdido.`}
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
        confirmLabel="Remover"
      />
    </div>
  )
}
