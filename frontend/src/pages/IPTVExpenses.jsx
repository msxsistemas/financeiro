import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'
import PeriodFilter, { periodRange } from '../components/PeriodFilter'
import api from '../api'
import { formatCurrencyBRL, formatDateBR } from '../utils/masks'

const IPTV_TAG = 'IPTV'

const defaultForm = { description: '', amount: '', notes: '' }

export default function IPTVExpenses() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('month')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: 'expense', limit: 200, cost_center: IPTV_TAG })
      if (search) params.set('search', search)
      const range = periodRange(period)
      if (range.start_date) params.set('start_date', range.start_date)
      if (range.end_date) params.set('end_date', range.end_date)
      const { data } = await api.get(`/api/transactions?${params}`)
      setItems(data.data || [])
    } catch {
      toast.error('Erro ao carregar despesas IPTV')
    } finally { setLoading(false) }
  }, [search, period])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(defaultForm); setModal(true) }
  const openEdit = (item) => {
    setEditing(item)
    setForm({
      description: item.description || '',
      amount: item.amount != null ? String(item.amount) : '',
      notes: item.notes || ''
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.description || !form.amount) return toast.error('Descrição e valor são obrigatórios')
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const payload = {
        description: form.description,
        amount: parseFloat(form.amount),
        type: 'expense',
        status: 'completed',
        cost_center: IPTV_TAG,
        due_date: today,
        paid_date: today,
        notes: form.notes || null
      }
      if (editing) await api.put(`/api/transactions/${editing.id}`, payload)
      else await api.post('/api/transactions', payload)
      toast.success('Salvo!')
      setModal(false)
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/api/transactions/${deleteConfirm.id}`)
      toast.success('Removida')
      setDeleteConfirm(null)
      load()
    } catch { toast.error('Erro ao remover') }
  }

  const totalAmount = items.reduce((s, i) => s + parseFloat(i.amount || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Despesas IPTV</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {items.length} no período · <strong className="text-red-600">{formatCurrencyBRL(totalAmount)}</strong>
          </p>
        </div>
        <button onClick={openCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Nova Despesa IPTV
        </button>
      </div>

      <PeriodFilter value={period} onChange={setPeriod} />

      <div className="flex gap-2 flex-wrap items-center">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por descrição..."
          className="flex-1 min-w-[200px] border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
          <p className="text-4xl mb-2">📺</p>
          <p>Nenhuma despesa IPTV no período</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">{item.description}</h3>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-purple-500" /> IPTV
                    </span>
                    <span>📅 {formatDateBR(item.created_at || item.paid_date || item.due_date)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-red-600">-{formatCurrencyBRL(item.amount)}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button onClick={() => openEdit(item)} className="text-xs text-gray-500 hover:text-gray-700 ml-auto">✏️ Editar</button>
                <button onClick={() => setDeleteConfirm(item)} className="text-xs text-red-500 hover:text-red-700">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar Despesa IPTV' : 'Nova Despesa IPTV'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição *</label>
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: Painel, servidor, mensalidade..." autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor (R$) *</label>
            <MaskedInput mask="currency" value={form.amount} onValueChange={v => setForm(p => ({ ...p, amount: v }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="0,00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observações</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Detalhes adicionais..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)}
              className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover despesa"
        message={`Remover "${deleteConfirm?.description}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        confirmLabel="Remover"
      />
    </div>
  )
}
