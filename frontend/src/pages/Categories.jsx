import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import ConfirmDialog from '../components/ConfirmDialog'
import api from '../api'

const typeLabel = { income: 'Receita', expense: 'Despesa' }
const typeColor = {
  income: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  expense: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [form, setForm] = useState({ name: '', type: 'expense', color: '#6366f1' })
  const [editing, setEditing] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/transactions/categories/list')
      setCategories(data || [])
    } catch {
      toast.error('Erro ao carregar categorias')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const resetForm = () => { setForm({ name: '', type: 'expense', color: '#6366f1' }); setEditing(null) }

  const save = async () => {
    if (!form.name.trim()) return toast.error('Nome obrigatório')
    try {
      const payload = { name: form.name.trim(), type: form.type, color: form.color }
      if (editing) await api.put(`/api/transactions/categories/${editing.id}`, payload)
      else await api.post('/api/transactions/categories', payload)
      toast.success('Salvo!')
      resetForm()
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar') }
  }

  const startEdit = (c) => {
    setEditing(c)
    setForm({ name: c.name, type: c.type, color: c.color || '#6366f1' })
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/api/transactions/categories/${deleteConfirm.id}`)
      toast.success('Removida')
      setDeleteConfirm(null)
      load()
    } catch { toast.error('Erro ao remover') }
  }

  const filtered = typeFilter ? categories.filter(c => c.type === typeFilter) : categories
  const byType = {
    income: filtered.filter(c => c.type === 'income'),
    expense: filtered.filter(c => c.type === 'expense')
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Categorias</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">{categories.length} categorias cadastradas</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[['', 'Todas'], ['expense', 'Despesas'], ['income', 'Receitas']].map(([v, l]) => (
          <button key={v} onClick={() => setTypeFilter(v)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${typeFilter === v
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-400'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">
          {editing ? 'Editar categoria' : 'Nova categoria'}
        </h2>
        <div className="grid md:grid-cols-[1fr_auto_auto_auto] gap-2">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Nome da categoria"
            className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
            className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
          <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
            className="h-10 w-14 border dark:border-gray-600 rounded cursor-pointer" />
          <div className="flex gap-2">
            {editing && (
              <button onClick={resetForm}
                className="border dark:border-gray-600 text-gray-600 dark:text-gray-300 py-2 px-3 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                Cancelar
              </button>
            )}
            <button onClick={save}
              className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg text-sm font-medium">
              {editing ? 'Salvar' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
          <p className="text-4xl mb-2">🏷️</p>
          <p>Nenhuma categoria</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {['expense', 'income'].filter(t => !typeFilter || typeFilter === t).map(t => (
            <div key={t} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 text-sm uppercase">
                {typeLabel[t]} ({byType[t].length})
              </h3>
              {byType[t].length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Sem categorias</p>
              ) : (
                <div className="space-y-2">
                  {byType[t].map(c => (
                    <div key={c.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color || '#6366f1' }} />
                      <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{c.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${typeColor[c.type]}`}>{typeLabel[c.type]}</span>
                      <button onClick={() => startEdit(c)}
                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 text-xs">✏️</button>
                      <button onClick={() => setDeleteConfirm(c)}
                        className="text-red-500 hover:text-red-700 text-xs">🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover categoria"
        message={`Remover "${deleteConfirm?.name}"? Transações/despesas com essa categoria ficarão sem categoria.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        confirmLabel="Remover"
      />
    </div>
  )
}
