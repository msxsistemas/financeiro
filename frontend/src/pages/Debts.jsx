import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import PixQrCode from '../components/PixQrCode'
import MaskedInput from '../components/MaskedInput'
import NumberStepper from '../components/NumberStepper'
import PeriodFilter, { periodRange } from '../components/PeriodFilter'
import api from '../api'
import { formatCurrencyBRL, formatDateBR } from '../utils/masks'

const fmt = formatCurrencyBRL

const statusLabel = { pending: 'Pendente', partial: 'Parcial', paid: 'Pago', overdue: 'Vencido' }
const statusColor = {
  pending: 'bg-yellow-100 text-yellow-700',
  partial: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700'
}

const defaultForm = {
  description: '', amount: '', type: 'payable', contact_name: '',
  contact_phone: '', due_date: '', installments: 1, notes: '', auto_installments: false,
  is_recurring: false, auto_notify: true, notify_days_before: '0'
}

export default function Debts({ forcedTab }) {
  const { subtab } = useParams()
  const navigateTo = useNavigate()
  const [items, setItems] = useState([])
  const [contacts, setContacts] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const pageRef = useRef(1)
  const loadGenRef = useRef(0)
  const sentinelRef = useRef(null)
  const [modal, setModal] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [detailModal, setDetailModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [payForm, setPayForm] = useState({ amount: '', notes: '' })
  const [tab, setTab] = useState(forcedTab || subtab || 'payable')

  useEffect(() => {
    const t = forcedTab || subtab
    if (t && t !== tab) setTab(t)
  }, [forcedTab, subtab])
  const [contactSearch, setContactSearch] = useState('')
  const [showContactList, setShowContactList] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [period, setPeriod] = useState('all')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [stats, setStats] = useState(null)
  const [notifying, setNotifying] = useState(null)
  const [notifyingAll, setNotifyingAll] = useState(false)

  const loadStats = useCallback(() => {
    api.get('/api/debts/stats').then(r => setStats(r.data)).catch(() => {})
  }, [])

  const load = useCallback(async (reset = true) => {
    if (reset) { pageRef.current = 1; setLoading(true) }
    else setLoadingMore(true)
    const gen = reset ? ++loadGenRef.current : loadGenRef.current
    try {
      const params = new URLSearchParams({ type: tab, page: pageRef.current, limit: 20 })
      if (statusFilter) params.set('status', statusFilter)
      const range = periodRange(period)
      if (range.start_date) params.set('start_date', range.start_date)
      if (range.end_date) params.set('end_date', range.end_date)
      const { data } = await api.get(`/api/debts?${params}`)
      if (gen !== loadGenRef.current) return
      if (reset) setItems(data.data)
      else setItems(prev => [...prev, ...data.data])
      setTotal(data.total)
      setHasMore(data.page < data.pages)
    } catch {
      if (gen !== loadGenRef.current) return
      toast.error('Erro ao carregar dívidas')
    } finally {
      if (gen !== loadGenRef.current) return
      if (reset) setLoading(false)
      else setLoadingMore(false)
    }
  }, [tab, statusFilter, period])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return
    pageRef.current += 1
    await load(false)
  }, [hasMore, loadingMore, loading, load])

  useEffect(() => { load(true) }, [load])
  useEffect(() => { loadStats() }, [loadStats])

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore() },
      { threshold: 0.1 }
    )
    if (sentinelRef.current) observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [loadMore])
  useEffect(() => {
    api.get('/api/contacts?limit=200').then(r => setContacts(r.data.data)).catch(() => {})
  }, [])

  const openCreate = () => { setEditing(null); setForm({ ...defaultForm, type: tab }); setContactSearch(''); setModal(true) }
  const openEdit = (item) => {
    setEditing(item)
    setForm({
      description: item.description, amount: item.amount, type: item.type,
      contact_name: item.contact_name || '', contact_phone: item.contact_phone || '',
      due_date: item.due_date ? String(item.due_date).substring(0, 10) : '',
      installments: item.installments || 1,
      notes: item.notes || '', status: item.status,
      is_recurring: !!item.is_recurring,
      auto_notify: item.auto_notify !== false,
      notify_days_before: String(item.notify_days_before ?? 0)
    })
    setModal(true)
  }

  const openDetail = async (item) => {
    setSelected(item)
    const { data } = await api.get(`/api/debts/${item.id}`)
    setDetail(data)
    setDetailModal(true)
  }

  const openPay = (item) => {
    setSelected(item)
    const remaining = parseFloat(item.amount) - parseFloat(item.paid_amount || 0)
    setPayForm({ amount: remaining.toFixed(2), notes: '' })
    setPayModal(true)
  }

  const handleSave = async () => {
    if (!form.description || !form.amount) return toast.error('Preencha os campos obrigatórios')
    const payload = { ...form, notify_days_before: parseInt(form.notify_days_before) || 0 }
    try {
      if (editing) {
        await api.put(`/api/debts/${editing.id}`, payload)
        toast.success('Atualizado!')
      } else {
        await api.post('/api/debts', payload)
        toast.success('Dívida criada!')
      }
      setModal(false); load(); loadStats()
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao salvar') }
  }

  const handlePay = async () => {
    if (!payForm.amount || payForm.amount <= 0) return toast.error('Valor inválido')
    try {
      await api.post(`/api/debts/${selected.id}/pay`, payForm)
      toast.success('Pagamento registrado!')
      setPayModal(false); load(); loadStats()
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao registrar pagamento') }
  }

  const handleDownloadPDF = async (item) => {
    const token = localStorage.getItem('fin_token')
    const baseUrl = import.meta.env.VITE_API_URL || 'https://apifinanceiro.msxsystem.site'
    setPdfLoading(item.id)
    try {
      const res = await fetch(`${baseUrl}/api/debts/${item.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { toast.error('Erro ao gerar PDF'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `cobranca_${item.id}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao baixar PDF') }
    finally { setPdfLoading(null) }
  }

  const handleExportCSV = async () => {
    const token = localStorage.getItem('fin_token')
    const baseUrl = import.meta.env.VITE_API_URL || 'https://apifinanceiro.msxsystem.site'
    setCsvLoading(true)
    try {
      const res = await fetch(`${baseUrl}/api/debts/export/csv?type=${tab}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { toast.error('Erro ao exportar'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `dividas_${tab}.csv`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao exportar CSV') }
    finally { setCsvLoading(false) }
  }

  const handleNotify = async (item) => {
    if (!item.contact_phone) return toast.error('Dívida sem telefone para cobrar')
    setNotifying(item.id)
    try {
      await api.post(`/api/whatsapp/notify-debt/${item.id}`)
      toast.success('Cobrança enviada via WhatsApp!')
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao enviar cobrança') }
    finally { setNotifying(null) }
  }

  const handleNotifyOverdue = async () => {
    setNotifyingAll(true)
    try {
      const { data } = await api.post('/api/debts/notify-overdue')
      toast.success(data.message)
      load()
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao enviar cobranças') }
    finally { setNotifyingAll(false) }
  }

  const handleDuplicate = async (item) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const payload = {
        description: item.description,
        amount: parseFloat(item.amount),
        type: item.type,
        contact_name: item.contact_name || null,
        contact_phone: item.contact_phone || null,
        due_date: today,
        installments: 1,
        notes: item.notes || null,
        is_recurring: false
      }
      await api.post('/api/debts', payload)
      toast.success('Dívida duplicada!')
      load(); loadStats()
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao duplicar') }
  }

  const handleDelete = async (id) => {
    try { await api.delete(`/api/debts/${id}`); toast.success('Removido!'); setDeleteConfirm(null); load(); loadStats() }
    catch { toast.error('Erro ao remover') }
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dívidas</h1>
          <p className="text-gray-500 text-sm">Cobranças particulares · {total} registros</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tab === 'receivable' && stats?.overdue_count > 0 && (
            <button onClick={handleNotifyOverdue} disabled={notifyingAll}
              className="bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
              {notifyingAll ? '⏳ Enviando...' : `📲 Cobrar vencidas (${stats.overdue_count})`}
            </button>
          )}
          <button onClick={handleExportCSV} disabled={csvLoading}
            className="border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 px-3 py-2 rounded-lg text-sm">
            {csvLoading ? '⏳' : '📥 CSV'}
          </button>
          <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Nova Dívida
          </button>
        </div>
      </div>


      {/* Cards de resumo */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Em Aberto</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.open_count}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">A Receber</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{fmt(stats.total_receivable)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">A Pagar</p>
            <p className="text-xl font-bold text-red-500">{fmt(stats.total_payable)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Vencidas{stats.due_today_count > 0 ? ` · ${stats.due_today_count} hoje` : ''}</p>
            <p className="text-xl font-bold text-orange-500">{stats.overdue_count}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">{tab === 'payable' ? 'Total Pago' : 'Total Recebido'}</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(tab === 'payable' ? stats.total_paid : stats.total_received)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      {!forcedTab && (
        <div className="flex gap-1 border-b dark:border-gray-700">
          <button onClick={() => { setTab('receivable'); navigateTo('/debts/receivable') }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'receivable' ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
            A Receber
          </button>
          <button onClick={() => { setTab('payable'); navigateTo('/debts/payable') }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'payable' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
            A Pagar
          </button>
        </div>
      )}

      {/* Filtros */}
      <PeriodFilter value={period} onChange={setPeriod} />
      <div className="flex gap-2 flex-wrap">
        {[['', 'Todos'], ['pending', 'Pendente'], ['partial', 'Parcial'], ['overdue', 'Vencido'], ['paid', 'Pago']].map(([v, l]) => (
          <button key={v} onClick={() => setStatusFilter(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${statusFilter === v ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Cards de dívidas */}
      <div className="space-y-3">
        {loading && <div className="text-center py-8 text-gray-400">Carregando...</div>}
        {!loading && items.length === 0 && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
            <p className="text-4xl mb-2">📋</p>
            <p>Nenhuma dívida cadastrada</p>
          </div>
        )}
        {items.map(item => {
          const remaining = parseFloat(item.amount) - parseFloat(item.paid_amount || 0)
          const pct = Math.min(100, (parseFloat(item.paid_amount || 0) / parseFloat(item.amount)) * 100)
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const isOverdue = item.due_date && new Date(String(item.due_date).substring(0, 10) + 'T12:00:00') < today && item.status !== 'paid'

          return (
            <div key={item.id} className={`bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border ${isOverdue ? 'border-red-200 dark:border-red-800' : 'border-gray-100 dark:border-gray-700'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">{item.description}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusColor[item.status]}`}>
                      {statusLabel[item.status]}
                    </span>
                    {isOverdue && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">⚠️ Vencido</span>}
                    {item.is_recurring && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0" title="Repete todo mês">🔁 Mensal</span>}
                    {item.auto_notify !== false && item.contact_phone && item.type === 'receivable' && item.status !== 'paid' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 shrink-0"
                        title={`Cobrança automática ${item.notify_days_before > 0 ? `${item.notify_days_before} dia(s) antes do vencimento` : 'no vencimento'}`}>
                        🔔 Auto
                      </span>
                    )}
                  </div>
                  {item.contact_name && (
                    <p className="text-sm text-gray-500">👤 {item.contact_name} {item.contact_phone && `· 📱 ${item.contact_phone}`}</p>
                  )}
                  {item.due_date && (
                    <p className={`text-xs mt-1 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                      Vence: {new Date(String(item.due_date).substring(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  )}
                  {/* Progress bar */}
                  {item.status !== 'paid' && pct > 0 && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Pago: {fmt(item.paid_amount)}</span>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold text-gray-900">{fmt(remaining)}</p>
                  {parseFloat(item.amount) !== remaining && (
                    <p className="text-xs text-gray-400">de {fmt(item.amount)}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-4 pt-3 border-t">
                <button onClick={() => openDetail(item)} className="text-xs text-indigo-600 hover:text-indigo-800">Ver detalhes</button>
                {item.status !== 'paid' && (
                  <button onClick={() => openPay(item)} className="text-xs text-green-600 hover:text-green-800">💳 Pagar</button>
                )}
                {item.contact_phone && item.status !== 'paid' && (
                  <button onClick={() => handleNotify(item)} disabled={notifying === item.id}
                    className="text-xs text-emerald-600 hover:text-emerald-800 disabled:opacity-60">
                    {notifying === item.id ? '⏳ Enviando...' : '💬 Cobrar'}
                  </button>
                )}
                <button onClick={() => handleDuplicate(item)} className="text-xs text-amber-600 hover:text-amber-800" title="Criar outra dívida igual a esta com vencimento hoje">🔁 Duplicar</button>
                <button onClick={() => handleDownloadPDF(item)} disabled={pdfLoading === item.id} className="text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50">
                  {pdfLoading === item.id ? '⏳' : '📄 PDF'}
                </button>
                <button onClick={() => openEdit(item)} className="text-xs text-gray-500 hover:text-gray-700 ml-auto">✏️ Editar</button>
                <button onClick={() => setDeleteConfirm(item)} className="text-xs text-red-500 hover:text-red-700">🗑️</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Sentinel de scroll infinito */}
      <div ref={sentinelRef} className="py-2 text-center">
        {loadingMore && <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />}
        {!hasMore && items.length > 0 && !loading && (
          <p className="text-xs text-gray-400 dark:text-gray-600">— {total} registros —</p>
        )}
      </div>

      {/* Modal criar/editar */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar Dívida' : (form.type === 'receivable' ? 'Nova Dívida a Receber' : 'Nova Dívida a Pagar')} size="lg">
        <div className="space-y-4">
          {editing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => f('status', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="pending">Pendente</option>
                <option value="partial">Parcial</option>
                <option value="paid">Pago</option>
                <option value="overdue">Vencido</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
            <input value={form.description} onChange={e => f('description', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: Empréstimo, conta, fornecedor..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor Total (R$) *</label>
              <MaskedInput mask="currency" value={form.amount} onValueChange={v => f('amount', v)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0,00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parcelas</label>
              <NumberStepper value={String(form.installments || 1)} min={1} max={360}
                onChange={v => f('installments', v)} />
            </div>
          </div>

          {!editing && parseInt(form.installments) > 1 && (
            <label className="flex items-center gap-3 cursor-pointer bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
              <input type="checkbox" checked={form.auto_installments} onChange={e => f('auto_installments', e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded" />
              <div>
                <p className="text-sm font-medium text-indigo-700">📅 Gerar parcelas automaticamente</p>
                <p className="text-xs text-indigo-500">Cria {form.installments} parcelas mensais de {form.amount ? `R$ ${(parseFloat(form.amount) / parseInt(form.installments)).toFixed(2)}` : 'R$ 0,00'} cada</p>
              </div>
            </label>
          )}

          {/* Picker de contato */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contato</label>
            <div className="relative">
              <input
                value={contactSearch || form.contact_name}
                onChange={e => {
                  setContactSearch(e.target.value)
                  f('contact_name', e.target.value)
                  setShowContactList(true)
                }}
                onFocus={() => setShowContactList(true)}
                placeholder="Buscar na agenda ou digitar nome..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
              />
              {form.contact_name && (
                <button onClick={() => { f('contact_name', ''); f('contact_phone', ''); setContactSearch('') }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 text-xs">✕</button>
              )}
              {showContactList && contactSearch.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {contacts.filter(c =>
                    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
                    (c.phone && c.phone.includes(contactSearch))
                  ).slice(0, 6).map(c => (
                    <button key={c.id}
                      onClick={() => { f('contact_name', c.name); f('contact_phone', c.phone || ''); setContactSearch(''); setShowContactList(false) }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center justify-between">
                      <span className="font-medium">{c.name}</span>
                      {c.phone && <span className="text-gray-400 text-xs">{c.phone}</span>}
                    </button>
                  ))}
                  {contacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase())).length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">Nenhum contato encontrado — será salvo como digitado</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
            <MaskedInput mask="phone" value={form.contact_phone} onValueChange={v => f('contact_phone', v)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="(11) 99999-9999" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de vencimento</label>
            <input type="date" value={form.due_date} onChange={e => f('due_date', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {form.due_date && !form.auto_installments && (
            <label className="flex items-center gap-3 cursor-pointer bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
              <input type="checkbox" checked={!!form.is_recurring} onChange={e => f('is_recurring', e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">🔁 Repetir todo mês</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500">Cria uma nova dívida automaticamente no dia {form.due_date ? new Date(form.due_date + 'T12:00:00').getDate() : '—'} de cada mês</p>
              </div>
            </label>
          )}

          {/* Cobrança automática no vencimento */}
          <div className="border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 bg-indigo-50 dark:bg-indigo-900/20">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">🔔 Notificar vencimento (WhatsApp)</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={!!form.auto_notify}
                  onChange={e => f('auto_notify', e.target.checked)} className="sr-only peer" />
                <div className="w-10 h-5 bg-gray-300 dark:bg-gray-600 peer-focus:ring-2 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
              </label>
            </div>
            {form.auto_notify && (
              <div className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 mt-3">
                <span>Avisar</span>
                <NumberStepper value={String(form.notify_days_before ?? '0')} min={0} max={30}
                  onChange={v => f('notify_days_before', v)} />
                <span>dia(s) antes + no vencimento e vencidas</span>
              </div>
            )}
            <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2">
              Cobrança automática às 8h (só para dívidas a receber com telefone). Você também recebe um push no dia do vencimento.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Detalhes adicionais..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium">
              {editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal pagamento */}
      <Modal open={payModal} onClose={() => setPayModal(false)} title="Registrar Pagamento" size="sm">
        {selected && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-sm">
              <p className="font-medium dark:text-white">{selected.description}</p>
              <p className="text-gray-500 dark:text-gray-400">Restante: {fmt(parseFloat(selected.amount) - parseFloat(selected.paid_amount || 0))}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor do Pagamento (R$)</label>
              <MaskedInput mask="currency" value={payForm.amount} onValueChange={v => setPayForm(p => ({ ...p, amount: v }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0,00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
              <input value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Ex: Pix, dinheiro..." />
            </div>
            {/* Pix QR para dividas a receber */}
            {selected?.type === 'receivable' && (
              <PixQrCode
                amount={parseFloat(selected.amount) - parseFloat(selected.paid_amount || 0)}
                description={selected.description}
              />
            )}
            <div className="flex gap-3">
              <button onClick={() => setPayModal(false)} className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={handlePay} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium">
                Confirmar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal detalhes */}
      <Modal open={detailModal} onClose={() => setDetailModal(false)} title="Detalhes da Dívida">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Valor total:</span> <span className="font-semibold">{fmt(detail.amount)}</span></div>
              <div><span className="text-gray-500">Pago:</span> <span className="font-semibold text-green-600">{fmt(detail.paid_amount)}</span></div>
              <div><span className="text-gray-500">Restante:</span> <span className="font-semibold text-red-600">{fmt(parseFloat(detail.amount) - parseFloat(detail.paid_amount || 0))}</span></div>
              <div><span className="text-gray-500">Parcelas:</span> <span className="font-semibold">{detail.installments}x</span></div>
            </div>
            {detail.notes && <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm text-gray-600 dark:text-gray-300">{detail.notes}</div>}
            <div>
              <h4 className="font-medium text-gray-800 mb-2">Histórico de pagamentos</h4>
              {detail.payments?.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum pagamento registrado</p>
              ) : (
                <div className="space-y-2">
                  {detail.payments?.map(p => {
                    const paidDate = p.paid_at ? formatDateBR(p.paid_at) : ''
                    return (
                      <div key={p.id} className="flex justify-between text-sm py-2 border-b">
                        <span>{paidDate} {p.notes && `- ${p.notes}`}</span>
                        <span className="font-semibold text-green-600">+{fmt(p.amount)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover dívida"
        message={`Deseja remover "${deleteConfirm?.description}"? Esta ação não pode ser desfeita.`}
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
        confirmLabel="Remover"
      />
    </div>
  )
}
