import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'
import PeriodFilter, { periodRange } from '../components/PeriodFilter'
import api from '../api'
import { formatCurrencyBRL, formatDateBR } from '../utils/masks'

const todayISO = () => new Date().toISOString().split('T')[0]

const defaultForm = {
  description: '', amount: '', category_id: '', notes: '',
  date: todayISO(), is_recurring: false
}

export default function Expenses() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('month')

  const [catModal, setCatModal] = useState(false)
  const [catForm, setCatForm] = useState({ name: '', color: '#6366f1' })
  const [catEditing, setCatEditing] = useState(null)
  const [catDeleteConfirm, setCatDeleteConfirm] = useState(null)

  const loadCategories = useCallback(() => {
    api.get('/api/transactions/categories/list')
      .then(r => setCategories((r.data || []).filter(c => c.type === 'expense')))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: 'expense', limit: 200 })
      if (search) params.set('search', search)
      const range = periodRange(period)
      if (range.start_date) params.set('start_date', range.start_date)
      if (range.end_date) params.set('end_date', range.end_date)
      const { data } = await api.get(`/api/transactions?${params}`)
      setItems(data.data || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('Erro ao carregar despesas')
    } finally { setLoading(false) }
  }, [search, period])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadCategories() }, [loadCategories])

  const openCreate = () => { setEditing(null); setForm({ ...defaultForm, date: todayISO() }); setModal(true) }
  const openEdit = (item) => {
    setEditing(item)
    const existing = item.due_date || item.paid_date || item.created_at
    setForm({
      description: item.description || '',
      amount: item.amount != null ? String(item.amount) : '',
      category_id: item.category_id || '',
      notes: item.notes || '',
      date: existing ? String(existing).substring(0, 10) : todayISO(),
      is_recurring: !!item.is_recurring
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.description || !form.amount) return toast.error('Descrição e valor são obrigatórios')
    setSaving(true)
    try {
      const date = form.date || todayISO()
      const payload = {
        description: form.description,
        amount: parseFloat(form.amount),
        type: 'expense',
        status: form.is_recurring ? 'pending' : 'completed',
        category_id: form.category_id || null,
        due_date: date,
        paid_date: form.is_recurring ? null : date,
        notes: form.notes || null,
        is_recurring: !!form.is_recurring,
        recurrence_type: form.is_recurring ? 'monthly' : null
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

  const handleDuplicate = async (item) => {
    try {
      const today = todayISO()
      await api.post('/api/transactions', {
        description: item.description,
        amount: parseFloat(item.amount),
        type: 'expense',
        status: 'completed',
        category_id: item.category_id || null,
        due_date: today,
        paid_date: today,
        notes: item.notes || null,
        is_recurring: false,
        recurrence_type: null
      })
      toast.success('Despesa duplicada!')
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao duplicar') }
  }

  // ── Categorias
  const openCatCreate = () => { setCatEditing(null); setCatForm({ name: '', color: '#6366f1' }); setCatModal(true) }
  const openCatEdit = (c) => { setCatEditing(c); setCatForm({ name: c.name, color: c.color || '#6366f1' }); setCatModal(true) }
  const saveCategory = async () => {
    if (!catForm.name.trim()) return toast.error('Nome obrigatório')
    try {
      const payload = { name: catForm.name.trim(), type: 'expense', color: catForm.color }
      if (catEditing) await api.put(`/api/transactions/categories/${catEditing.id}`, payload)
      else await api.post('/api/transactions/categories', payload)
      toast.success('Categoria salva')
      setCatModal(false)
      loadCategories()
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar categoria') }
  }
  const deleteCategory = async () => {
    try {
      await api.delete(`/api/transactions/categories/${catDeleteConfirm.id}`)
      toast.success('Categoria removida')
      setCatDeleteConfirm(null)
      loadCategories()
      load()
    } catch { toast.error('Erro ao remover categoria') }
  }

  const totalAmount = items.reduce((s, i) => s + parseFloat(i.amount || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Despesas</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {items.length} no período · <strong className="text-red-600">{formatCurrencyBRL(totalAmount)}</strong>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={openCatCreate}
            className="border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-2 rounded-lg text-sm font-medium">
            🏷️ Categorias
          </button>
          <button onClick={openCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Nova Despesa
          </button>
        </div>
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
          <p className="text-4xl mb-2">💸</p>
          <p>Nenhuma despesa no período</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const cat = categories.find(c => String(c.id) === String(item.category_id))
            return (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{item.description}</h3>
                      {item.is_recurring && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0" title="Despesa fixa mensal">🔁 Mensal</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {item.category_name && (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat?.color || '#6366f1' }} />
                          {item.category_name}
                        </span>
                      )}
                      <span>📅 {formatDateBR(item.paid_date || item.due_date || item.created_at)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-red-600">-{formatCurrencyBRL(item.amount)}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={() => handleDuplicate(item)} className="text-xs text-amber-600 hover:text-amber-800" title="Lançar outra igual hoje">🔁 Duplicar</button>
                  <button onClick={() => openEdit(item)} className="text-xs text-gray-500 hover:text-gray-700 ml-auto">✏️ Editar</button>
                  <button onClick={() => setDeleteConfirm(item)} className="text-xs text-red-500 hover:text-red-700">🗑️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Despesa */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar Despesa' : 'Nova Despesa'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição *</label>
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: Aluguel, energia, mercado..." autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor (R$) *</label>
              <MaskedInput mask="currency" value={form.amount} onValueChange={v => setForm(p => ({ ...p, amount: v }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0,00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoria</label>
              <select value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Sem categoria</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data *</label>
            <input type="date" value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <p className="text-xs text-gray-400 mt-1">Deixe a data de hoje ou escolha outro dia (retroativo ou futuro).</p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
            <input type="checkbox" checked={!!form.is_recurring}
              onChange={e => setForm(p => ({ ...p, is_recurring: e.target.checked }))}
              className="w-4 h-4 text-emerald-600 rounded" />
            <div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">🔁 Despesa fixa (todo mês)</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-500">
                {form.date
                  ? `Cria automaticamente no dia ${new Date(form.date + 'T12:00:00').getDate()} de cada mês.`
                  : 'Cria automaticamente todo mês na data escolhida.'}
              </p>
            </div>
          </label>

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

      {/* Modal Categorias */}
      <Modal open={catModal} onClose={() => setCatModal(false)} title="Categorias de despesa" size="md">
        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {catEditing ? 'Editar categoria' : 'Nova categoria'}
                </label>
                <input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Nome"
                  className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <input type="color" value={catForm.color} onChange={e => setCatForm(p => ({ ...p, color: e.target.value }))}
                className="h-10 w-12 border dark:border-gray-600 rounded cursor-pointer" />
            </div>
            <div className="flex gap-2">
              {catEditing && (
                <button onClick={() => { setCatEditing(null); setCatForm({ name: '', color: '#6366f1' }) }}
                  className="flex-1 border dark:border-gray-600 text-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                  Cancelar edição
                </button>
              )}
              <button onClick={saveCategory}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium">
                {catEditing ? 'Salvar alterações' : 'Adicionar'}
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400 mb-2">
              {categories.length} categoria(s)
            </h4>
            {categories.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhuma categoria cadastrada</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {categories.map(c => (
                  <div key={c.id} className="flex items-center gap-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color || '#6366f1' }} />
                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{c.name}</span>
                    <button onClick={() => openCatEdit(c)}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800">✏️</button>
                    <button onClick={() => setCatDeleteConfirm(c)}
                      className="text-xs text-red-500 hover:text-red-700">🗑️</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2">
            <button onClick={() => setCatModal(false)}
              className="w-full border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
              Fechar
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

      <ConfirmDialog
        open={!!catDeleteConfirm}
        title="Remover categoria"
        message={`Remover categoria "${catDeleteConfirm?.name}"? As despesas existentes ficarão sem categoria.`}
        onConfirm={deleteCategory}
        onCancel={() => setCatDeleteConfirm(null)}
        confirmLabel="Remover"
      />
    </div>
  )
}
