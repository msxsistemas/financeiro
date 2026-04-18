import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'
import api from '../api'

const defaultForm = {
  title: '', description: '', start_date: '',
  notify_whatsapp: false, notify_phone: '', reminder_minutes: 30
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export default function Calendar() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // View: 'calendar' (grid mensal) | 'list'
  const [view, setView] = useState('calendar')
  // Ancora do mês visualizado (primeiro dia)
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState(() => new Date())

  const monthStart = cursor
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: 1, limit: 500 })
      if (view === 'calendar') {
        params.set('start_date', ymd(monthStart))
        params.set('end_date', ymd(monthEnd))
      }
      const { data } = await api.get(`/api/calendar?${params}`)
      setItems(data.data || [])
    } catch { toast.error('Erro ao carregar agendamentos') }
    finally { setLoading(false) }
  }, [view, monthStart, monthEnd])

  useEffect(() => { load() }, [load])

  // Mapa: 'YYYY-MM-DD' -> [eventos]
  const eventsByDay = useMemo(() => {
    const map = {}
    for (const ev of items) {
      const k = ymd(new Date(ev.start_date))
      if (!map[k]) map[k] = []
      map[k].push(ev)
    }
    return map
  }, [items])

  // Grid do mês: 6 semanas * 7 dias
  const cells = useMemo(() => {
    const firstDayWeek = monthStart.getDay() // 0=dom
    const start = new Date(monthStart)
    start.setDate(1 - firstDayWeek)
    const out = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      out.push(d)
    }
    return out
  }, [monthStart])

  const openCreate = (preset) => {
    setEditing(null)
    const base = preset instanceof Date ? preset : new Date()
    // se clicou num dia (preset sem hora), usa 09:00 como default
    if (preset instanceof Date) {
      base.setHours(9, 0, 0, 0)
    }
    setForm({ ...defaultForm, start_date: `${ymd(base)}T${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}` })
    setModal(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      title: item.title, description: item.description || '',
      start_date: new Date(item.start_date).toISOString().slice(0, 16),
      notify_whatsapp: item.notify_whatsapp || false,
      notify_phone: item.notify_phone || '',
      reminder_minutes: item.reminder_minutes || 30
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.title || !form.start_date) return toast.error('Título e data são obrigatórios')
    try {
      const payload = { ...form, end_date: null }
      if (editing) {
        await api.put(`/api/calendar/${editing.id}`, payload)
        toast.success('Agendamento atualizado!')
      } else {
        await api.post('/api/calendar', payload)
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

  const prevMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
  const nextMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
  const gotoToday = () => {
    const now = new Date()
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDay(now)
  }

  const today = new Date()
  const selectedEvents = (eventsByDay[ymd(selectedDay)] || [])
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))

  const EventRow = ({ event }) => {
    const start = new Date(event.start_date)
    return (
      <div className="flex items-start gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 border border-indigo-100 dark:border-indigo-900/40">
        <div className="bg-indigo-600 text-white rounded-md px-2 py-1 text-xs font-semibold shrink-0 min-w-[54px] text-center">
          {start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-800 dark:text-white truncate">{event.title}</p>
          {event.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{event.description}</p>}
          {event.notify_whatsapp && event.notify_phone && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">💬 Lembrete {event.reminder_minutes}min antes</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => openEdit(event)} className="text-indigo-500 hover:text-indigo-700 text-sm">✏️</button>
          <button onClick={() => setDeleteConfirm(event)} className="text-red-400 hover:text-red-600 text-sm">🗑️</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agenda</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {items.length} agendamento(s) no mês
          </p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            <button onClick={() => setView('calendar')}
              className={`px-3 py-2 text-sm font-medium ${view === 'calendar' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
              📅 Calendário
            </button>
            <button onClick={() => setView('list')}
              className={`px-3 py-2 text-sm font-medium border-l border-gray-300 dark:border-gray-600 ${view === 'list' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
              ☰ Lista
            </button>
          </div>
          <button onClick={() => openCreate(selectedDay)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Novo Agendamento
          </button>
        </div>
      </div>

      {/* Navegação do mês */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700">
        <button onClick={prevMonth}
          className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">← Anterior</button>
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200 text-lg">
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <button onClick={gotoToday}
            className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
            Hoje
          </button>
        </div>
        <button onClick={nextMonth}
          className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Próximo →</button>
      </div>

      {loading && <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && view === 'calendar' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-2 sm:p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          {/* Cabeçalho dias da semana */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 py-2">
                {w}
              </div>
            ))}
          </div>

          {/* Grid dos dias */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === cursor.getMonth()
              const isToday = sameDay(d, today)
              const isSelected = sameDay(d, selectedDay)
              const events = eventsByDay[ymd(d)] || []
              const hasEvents = events.length > 0
              return (
                <button key={i} onClick={() => setSelectedDay(d)}
                  onDoubleClick={() => openCreate(d)}
                  className={`min-h-[72px] sm:min-h-[90px] rounded-lg p-1.5 sm:p-2 text-left transition-colors border-2
                    ${isSelected ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                      : isToday ? 'border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800'
                      : 'border-transparent bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700'}
                    ${!inMonth ? 'opacity-40' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-semibold ${isToday ? 'bg-indigo-600 text-white w-6 h-6 rounded-full inline-flex items-center justify-center' : 'text-gray-700 dark:text-gray-300'}`}>
                      {d.getDate()}
                    </span>
                    {hasEvents && (
                      <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-full font-semibold">
                        {events.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {events.slice(0, 2).map(ev => (
                      <div key={ev.id} className="text-[10px] sm:text-xs truncate bg-indigo-600 text-white rounded px-1 py-0.5">
                        {new Date(ev.start_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} {ev.title}
                      </div>
                    ))}
                    {events.length > 2 && (
                      <div className="text-[10px] text-gray-500 dark:text-gray-400">+{events.length - 2} mais</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
            Clique em um dia para ver os agendamentos · Duplo clique para criar
          </p>
        </div>
      )}

      {/* Painel do dia selecionado (apenas em calendar view) */}
      {!loading && view === 'calendar' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">
              {selectedDay.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </h3>
            <button onClick={() => openCreate(selectedDay)}
              className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded hover:bg-indigo-100">
              + Agendar neste dia
            </button>
          </div>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhum agendamento neste dia</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map(e => <EventRow key={e.id} event={e} />)}
            </div>
          )}
        </div>
      )}

      {/* View Lista (mês inteiro) */}
      {!loading && view === 'list' && (
        items.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
            <p className="text-4xl mb-2">📅</p>
            <p>Nenhum agendamento em {MONTHS[cursor.getMonth()]}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items
              .slice()
              .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
              .map(e => {
                const s = new Date(e.start_date)
                return (
                  <div key={e.id} className="flex items-start gap-4 bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="bg-indigo-100 dark:bg-indigo-900/40 rounded-xl p-3 text-center min-w-[56px]">
                      <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">{s.toLocaleDateString('pt-BR', { month: 'short' })}</div>
                      <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-200 leading-none">{s.getDate()}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{e.title}</h3>
                      <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                        {s.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {e.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{e.description}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => openEdit(e)} className="text-indigo-500 hover:text-indigo-700 text-sm">✏️</button>
                      <button onClick={() => setDeleteConfirm(e)} className="text-red-400 hover:text-red-600 text-sm">🗑️</button>
                    </div>
                  </div>
                )
              })}
          </div>
        )
      )}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar Agendamento' : 'Novo Agendamento'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título *</label>
            <input value={form.title} onChange={e => f('title', e.target.value)}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: pagamento, consulta, compromisso..." autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data e hora *</label>
            <input type="datetime-local" value={form.start_date} onChange={e => f('start_date', e.target.value)}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
            <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={2}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div className="border dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-700/50">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <input type="checkbox" checked={form.notify_whatsapp} onChange={e => f('notify_whatsapp', e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">💬 Enviar lembrete via WhatsApp</span>
            </label>
            {form.notify_whatsapp && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Número WhatsApp</label>
                  <MaskedInput mask="phone" value={form.notify_phone} onValueChange={v => f('notify_phone', v)}
                    className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Lembrete (min antes)</label>
                  <select value={form.reminder_minutes} onChange={e => f('reminder_minutes', parseInt(e.target.value))}
                    className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
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
            <button onClick={() => setModal(false)} className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium">
              {editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover agendamento"
        message={`Deseja remover "${deleteConfirm?.title}"?`}
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
        confirmLabel="Remover"
      />
    </div>
  )
}
