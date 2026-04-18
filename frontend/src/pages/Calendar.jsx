import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'
import api from '../api'

const defaultForm = {
  title: '', description: '', start_date: '', end_date: '',
  notify_whatsapp: false, notify_phone: '', reminder_minutes: 30
}

export default function Calendar() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [filters, setFilters] = useState({ start_date: '', end_date: '' })
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 20 })
      if (filters.start_date) params.set('start_date', filters.start_date)
      if (filters.end_date) params.set('end_date', filters.end_date)
      const { data } = await api.get(`/api/calendar?${params}`)
      setItems(data.data)
      setTotal(data.total)
      setPages(data.pages)
    } catch { toast.error('Erro ao carregar agendamentos') }
    finally { setLoading(false) }
  }, [page, filters])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...defaultForm, start_date: new Date().toISOString().slice(0, 16) })
    setModal(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      title: item.title, description: item.description || '',
      start_date: new Date(item.start_date).toISOString().slice(0, 16),
      end_date: item.end_date ? new Date(item.end_date).toISOString().slice(0, 16) : '',
      notify_whatsapp: item.notify_whatsapp || false,
      notify_phone: item.notify_phone || '',
      reminder_minutes: item.reminder_minutes || 30
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.title || !form.start_date) return toast.error('Título e data são obrigatórios')
    try {
      if (editing) {
        await api.put(`/api/calendar/${editing.id}`, form)
        toast.success('Agendamento atualizado!')
      } else {
        await api.post('/api/calendar', form)
        toast.success('Agendamento criado!')
      }
      setModal(false); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao salvar') }
  }

  const handleDelete = async (id) => {
    try { await api.delete(`/api/calendar/${id}`); toast.success('Removido!'); setDeleteConfirm(null); load() }
    catch { toast.error('Erro ao remover') }
  }


  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Agrupar por mês
  const upcoming = items.filter(e => new Date(e.start_date) >= new Date())
  const past = items.filter(e => new Date(e.start_date) < new Date())

  const EventCard = ({ event }) => {
    const start = new Date(event.start_date)
    const isPast = start < new Date()
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border flex items-start gap-4 ${isPast ? 'opacity-60 border-gray-100 dark:border-gray-700' : 'border-indigo-100 dark:border-indigo-800'}`}>
        <div className="bg-indigo-100 dark:bg-indigo-900/40 rounded-xl p-3 text-center min-w-[56px]">
          <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">{start.toLocaleDateString('pt-BR', { month: 'short' })}</div>
          <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-200 leading-none">{start.getDate()}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">{event.title}</h3>
            <div className="flex gap-1 shrink-0">
              {event.notify_whatsapp && <span title="Notificação WhatsApp" className="text-green-500">💬</span>}
              {event.notified && <span title="Notificação enviada" className="text-gray-400 text-xs">✓</span>}
            </div>
          </div>
          <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
            {start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            {event.end_date && ` - ${new Date(event.end_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
          {event.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{event.description}</p>}
          {event.notify_whatsapp && event.notify_phone && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">📱 Lembrete {event.reminder_minutes}min antes para {event.notify_phone}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => openEdit(event)} className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 text-sm">✏️</button>
          <button onClick={() => setDeleteConfirm(event)} className="text-red-400 hover:text-red-600 text-sm">🗑️</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agenda</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{total} agendamentos</p>
        </div>
        <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Novo Agendamento
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">De:</label>
          <input type="date" value={filters.start_date} onChange={e => setFilters(p => ({ ...p, start_date: e.target.value }))}
            className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Até:</label>
          <input type="date" value={filters.end_date} onChange={e => setFilters(p => ({ ...p, end_date: e.target.value }))}
            className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        {(filters.start_date || filters.end_date) && (
          <button onClick={() => setFilters({ start_date: '', end_date: '' })} className="text-sm text-gray-400 dark:text-gray-500 hover:text-red-500">
            ✕ Limpar filtros
          </button>
        )}
      </div>

      {loading && <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && items.length === 0 && (
        <div className="text-center py-12 text-gray-400 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
          <p className="text-4xl mb-2">📅</p>
          <p>Nenhum evento encontrado</p>
        </div>
      )}

      {!loading && upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wide">Próximos</h2>
          {upcoming.map(e => <EventCard key={e.id} event={e} />)}
        </div>
      )}

      {!loading && past.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-400 dark:text-gray-500 text-sm uppercase tracking-wide">Passados</h2>
          {past.map(e => <EventCard key={e.id} event={e} />)}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border dark:border-gray-600 rounded text-sm disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">← Ant</button>
          <span className="text-sm text-gray-600 dark:text-gray-400">{page} / {pages}</span>
          <button disabled={page === pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border dark:border-gray-600 rounded text-sm disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">Próx →</button>
        </div>
      )}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar Agendamento' : 'Novo Agendamento'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
            <input value={form.title} onChange={e => f('title', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: pagamento, consulta, compromisso..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data e hora início *</label>
              <input type="datetime-local" value={form.start_date} onChange={e => f('start_date', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data e hora fim</label>
              <input type="datetime-local" value={form.end_date} onChange={e => f('end_date', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Notificação WhatsApp */}
          <div className="border dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-700/50">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <input type="checkbox" checked={form.notify_whatsapp} onChange={e => f('notify_whatsapp', e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" />
              <span className="text-sm font-medium text-gray-700">💬 Enviar lembrete via WhatsApp</span>
            </label>
            {form.notify_whatsapp && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Número WhatsApp</label>
                  <MaskedInput mask="phone" value={form.notify_phone} onValueChange={v => f('notify_phone', v)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Lembrete (min antes)</label>
                  <select value={form.reminder_minutes} onChange={e => f('reminder_minutes', parseInt(e.target.value))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value={10}>10 minutos</option>
                    <option value={30}>30 minutos</option>
                    <option value={60}>1 hora</option>
                    <option value={120}>2 horas</option>
                    <option value={1440}>1 dia antes</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium">
              {editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover evento"
        message={`Deseja remover "${deleteConfirm?.title}"?`}
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
        confirmLabel="Remover"
      />
    </div>
  )
}
