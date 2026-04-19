import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'
import NumberStepper from '../components/NumberStepper'
import PeriodFilter, { periodRange } from '../components/PeriodFilter'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Pagination from '../components/Pagination'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../api'

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtDate = (d) => d ? new Date(String(d).substring(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const fmtRate = (v) => {
  const n = parseFloat(v)
  if (!isFinite(n)) return '0'
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

const statusLabel = { active: 'Ativo', paid: 'Quitado', defaulted: 'Inadimplente' }
const statusColor = {
  active: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  defaulted: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
}

const freqLabel = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' }

const defaultForm = {
  contact_id: '', contact_name: '', contact_phone: '',
  principal_amount: '', interest_rate: '0', interest_type: 'simple',
  frequency: 'monthly', installments: '1',
  start_date: new Date().toISOString().split('T')[0],
  first_due_date: '', notes: '',
  auto_notify: false, notify_days_before: '1',
  custom_message: ''
}

export default function Loans() {
  const [items, setItems] = useState([])
  const [contacts, setContacts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('active')
  const [period, setPeriod] = useState('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [notifyingLoan, setNotifyingLoan] = useState(null)

  const [modal, setModal] = useState(false)
  const [detailModal, setDetailModal] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [msgModal, setMsgModal] = useState(false)
  const [defaultMessage, setDefaultMessage] = useState('')
  const [templateDefault, setTemplateDefault] = useState('')
  const [savingMsg, setSavingMsg] = useState(false)

  const [form, setForm] = useState(defaultForm)
  const [detail, setDetail] = useState(null)
  const [selectedInst, setSelectedInst] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [contactSearch, setContactSearch] = useState('')
  const [showContactList, setShowContactList] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: statusFilter, page, limit: 20 })
      if (search) params.set('search', search)
      const range = periodRange(period)
      if (range.start_date) params.set('start_date', range.start_date)
      if (range.end_date) params.set('end_date', range.end_date)
      const { data } = await api.get(`/api/loans?${params}`)
      setItems(data.data)
      setTotal(data.total)
      setPages(data.pages)
    } catch { toast.error('Erro ao carregar empréstimos') }
    finally { setLoading(false) }
  }, [statusFilter, page, period, search])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [statusFilter])
  useEffect(() => {
    api.get('/api/contacts?limit=300').then(r => setContacts(r.data.data || [])).catch(() => {})
    api.get('/api/loans/default-message').then(r => {
      setDefaultMessage(r.data.message || '')
      setTemplateDefault(r.data.default_template || '')
    }).catch(() => {})
  }, [])

  const filteredContacts = contacts.filter(c =>
    c.name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.phone?.includes(contactSearch)
  ).slice(0, 8)

  const openDetail = async (item) => {
    try {
      const { data } = await api.get(`/api/loans/${item.id}`)
      setDetail(data)
      setDetailModal(true)
    } catch { toast.error('Erro ao carregar detalhes') }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({
      ...defaultForm,
      start_date: new Date().toISOString().split('T')[0],
      custom_message: defaultMessage || ''
    })
    setContactSearch('')
    setModal(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      contact_id: item.contact_id || '',
      contact_name: item.contact_name || '',
      contact_phone: item.contact_phone || '',
      principal_amount: item.principal_amount != null ? String(item.principal_amount) : '',
      interest_rate: item.interest_rate != null ? String(item.interest_rate) : '0',
      interest_type: item.interest_type || 'simple',
      frequency: item.frequency || 'monthly',
      installments: String(item.installments || 1),
      start_date: item.start_date ? String(item.start_date).substring(0, 10) : new Date().toISOString().split('T')[0],
      first_due_date: item.first_due_date ? String(item.first_due_date).substring(0, 10) : '',
      notes: item.notes || '',
      auto_notify: item.auto_notify || false,
      notify_days_before: String(item.notify_days_before || 1),
      custom_message: item.custom_message || defaultMessage || ''
    })
    setContactSearch(item.contact_name || '')
    setModal(true)
  }

  const notifyLoan = async (item) => {
    if (!item.contact_phone && !item.contact_name) {
      toast.error('Empréstimo sem contato para cobrar')
      return
    }
    setNotifyingLoan(item.id)
    try {
      // Busca próxima parcela em aberto
      const { data: full } = await api.get(`/api/loans/${item.id}`)
      const next = (full.installments_list || []).find(i => !i.paid)
      if (!next) {
        toast.error('Sem parcelas em aberto para cobrar')
        return
      }
      await api.post(`/api/loans/installments/${next.id}/notify`)
      toast.success('Cobrança enviada via WhatsApp!')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao enviar cobrança')
    } finally { setNotifyingLoan(null) }
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    try {
      await api.delete(`/api/loans/${deleteConfirm.id}`)
      toast.success('Empréstimo removido')
      setDeleteConfirm(null)
      load()
    } catch { toast.error('Erro ao remover') }
  }

  const saveDefaultMessage = async () => {
    setSavingMsg(true)
    try {
      await api.put('/api/loans/default-message', { message: defaultMessage })
      toast.success('Mensagem padrão salva')
      setMsgModal(false)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar')
    } finally { setSavingMsg(false) }
  }

  const resetDefaultMessage = () => setDefaultMessage(templateDefault || '')

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      let contactId = form.contact_id || null
      const name = (form.contact_name || contactSearch || '').trim()

      // Se tem nome mas não está vinculado a contato, cria (ou reusa por match de nome)
      if (!contactId && name) {
        const existing = contacts.find(c => c.name?.trim().toLowerCase() === name.toLowerCase())
        if (existing) {
          contactId = existing.id
        } else {
          try {
            const { data: created } = await api.post('/api/contacts', {
              name,
              phone: form.contact_phone || null,
              type: 'client'
            })
            contactId = created.id
            setContacts(prev => [...prev, created])
          } catch { /* silencioso — segue sem vincular */ }
        }
      }

      const payload = {
        ...form,
        principal_amount: parseFloat(form.principal_amount),
        interest_rate: parseFloat(form.interest_rate),
        late_fee_rate: 0,
        installments: parseInt(form.installments),
        notify_days_before: parseInt(form.notify_days_before),
        contact_id: contactId,
        contact_name: name || null
      }
      if (editing) {
        await api.put(`/api/loans/${editing.id}`, {
          contact_id: contactId,
          contact_name: name || null,
          contact_phone: form.contact_phone || null,
          notes: form.notes || null,
          auto_notify: form.auto_notify,
          notify_days_before: parseInt(form.notify_days_before),
          custom_message: form.custom_message || null
        })
        toast.success('Empréstimo atualizado!')
      } else {
        await api.post('/api/loans', payload)
        toast.success('Empréstimo criado!')
      }
      setModal(false)
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar empréstimo')
    }
  }

  const handlePay = async () => {
    if (!selectedInst) return
    const parsedAmount = parseFloat(payAmount)
    if (!payAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return toast.error('Informe um valor válido para o pagamento')
    }
    try {
      await api.post(`/api/loans/installments/${selectedInst.id}/pay`, { paid_amount: parsedAmount })
      toast.success('Pagamento registrado!')
      setPayModal(false)
      if (detail) {
        const { data } = await api.get(`/api/loans/${detail.id}`)
        setDetail(data)
      }
      load()
      // Offer receipt download
      const baseUrl = import.meta.env.VITE_API_URL || 'https://apifinanceiro.msxsystem.site'
      const token = localStorage.getItem('fin_token')
      const res = await fetch(`${baseUrl}/api/loans/installments/${selectedInst.id}/receipt`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `recibo_parcela_${selectedInst.installment_number}.pdf`; a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar pagamento')
    }
  }

  const downloadReceipt = async (inst) => {
    const baseUrl = import.meta.env.VITE_API_URL || 'https://apifinanceiro.msxsystem.site'
    const token = localStorage.getItem('fin_token')
    try {
      const res = await fetch(`${baseUrl}/api/loans/installments/${inst.id}/receipt`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return toast.error('Erro ao gerar recibo')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `recibo_parcela_${inst.installment_number}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erro ao baixar recibo') }
  }

  const notifyInstallment = async (inst) => {
    try {
      await api.post(`/api/loans/installments/${inst.id}/notify`)
      toast.success('Cobrança enviada via WhatsApp!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar cobrança')
    }
  }

  const notifyOverdue = async (loanId) => {
    try {
      const { data } = await api.post(`/api/loans/${loanId}/notify-overdue`)
      toast.success(data.message)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar cobranças')
    }
  }

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/api/loans/${id}`, { status })
      toast.success('Status atualizado')
      load()
      if (detail?.id === id) setDetailModal(false)
    } catch { toast.error('Erro ao atualizar') }
  }

  const deleteLoan = async (id) => {
    if (!confirm('Excluir este empréstimo?')) return
    try {
      await api.delete(`/api/loans/${id}`)
      toast.success('Excluído')
      setDetailModal(false)
      load()
    } catch { toast.error('Erro ao excluir') }
  }

  const isOverdue = (d) => d && new Date(d) < new Date()

  return (
    <div className="space-y-5">
      <PageHeader title="Empréstimos" subtitle="Controle de crédito pessoal com juros e cobranças automáticas">
        <button onClick={() => setMsgModal(true)}
          className="border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-2 rounded-lg text-sm font-medium">
          ⚙️ Mensagem padrão
        </button>
        <button onClick={openCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium">
          + Novo Empréstimo
        </button>
      </PageHeader>

      {/* Busca */}
      <input type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por nome do devedor..."
        className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />

      {/* Filtros */}
      <PeriodFilter value={period} onChange={setPeriod} />
      <div className="flex gap-2 mb-4">
        {['active', 'paid', 'defaulted'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors
              ${statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'}`}>
            {statusLabel[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <EmptyState message="Nenhum empréstimo encontrado" />
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => openDetail(item)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-800 dark:text-white">
                      {item.contact_name || 'Sem nome'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[item.status]}`}>
                      {statusLabel[item.status]}
                    </span>
                    {parseInt(item.installments_overdue) > 0 && (
                      <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 px-2 py-0.5 rounded-full font-medium">
                        {item.installments_overdue} vencida(s)
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>Principal: <strong className="text-gray-800 dark:text-gray-200">{fmt(item.principal_amount)}</strong></span>
                    <span>Juros: <strong>{fmtRate(item.interest_rate)}% {freqLabel[item.frequency]?.toLowerCase()} ({item.interest_type === 'compound' ? 'composto' : 'simples'})</strong></span>
                    <span>Parcelas: <strong>{item.installments_paid}/{item.installments_total}</strong></span>
                    {item.next_due_date && (
                      <span className={isOverdue(item.next_due_date) ? 'text-red-500 font-medium' : ''}>
                        Próx. venc.: <strong>{fmtDate(item.next_due_date)}</strong>
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-lg font-bold text-gray-800 dark:text-white">{fmt(item.amount_remaining)}</div>
                  <div className="text-xs text-gray-400">em aberto</div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex gap-2 flex-wrap">
                {item.status === 'active' && (
                  <>
                    <button onClick={() => notifyLoan(item)} disabled={notifyingLoan === item.id}
                      className="text-xs bg-green-50 hover:bg-green-100 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-60">
                      {notifyingLoan === item.id ? '⏳ Enviando...' : '💬 Cobrar'}
                    </button>
                    {parseInt(item.installments_overdue) > 0 && (
                      <button onClick={() => notifyOverdue(item.id)}
                        className="text-xs bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg font-medium transition-colors">
                        📲 Cobrar vencidas ({item.installments_overdue})
                      </button>
                    )}
                  </>
                )}
                <button onClick={() => openEdit(item)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 px-3 py-1.5 ml-auto">✏️ Editar</button>
                <button onClick={() => setDeleteConfirm(item)}
                  className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5">🗑️ Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Modal criar/editar */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar Empréstimo' : 'Novo Empréstimo'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome do devedor (busca em contatos) */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome {form.contact_id && <span className="text-xs text-indigo-500">· contato vinculado</span>}
            </label>
            <div className="relative">
              <input
                value={form.contact_id ? form.contact_name : contactSearch}
                onChange={e => {
                  const v = e.target.value
                  if (form.contact_id) {
                    setForm(f => ({ ...f, contact_id: '', contact_name: v, contact_phone: '' }))
                    setContactSearch(v)
                  } else {
                    setContactSearch(v)
                    setForm(f => ({ ...f, contact_name: v }))
                  }
                  setShowContactList(true)
                }}
                onFocus={() => setShowContactList(true)}
                placeholder="Digite o nome — será buscado na agenda"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white pr-8"
              />
              {(contactSearch || form.contact_id) && (
                <button type="button"
                  onClick={() => {
                    setForm(f => ({ ...f, contact_id: '', contact_name: '', contact_phone: '' }))
                    setContactSearch('')
                    setShowContactList(false)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 text-xs">✕</button>
              )}
            </div>
            {showContactList && !form.contact_id && contactSearch.length > 0 && filteredContacts.length > 0 && (
              <div className="absolute z-10 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                {filteredContacts.map(c => (
                  <div key={c.id} className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer text-sm"
                    onClick={() => {
                      setForm(f => ({ ...f, contact_id: c.id, contact_name: c.name, contact_phone: c.phone || '' }))
                      setContactSearch(c.name)
                      setShowContactList(false)
                    }}>
                    <div className="font-medium">{c.name}</div>
                    {c.phone && <div className="text-gray-400 text-xs">{c.phone}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Telefone — aparece se NÃO é contato já vinculado */}
          {!form.contact_id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Telefone <span className="text-xs text-gray-400">· será criado um novo contato ao salvar</span>
              </label>
              <MaskedInput mask="phone" value={form.contact_phone} onValueChange={v => setForm(f => ({ ...f, contact_phone: v }))}
                placeholder="(11) 99999-9999"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor Emprestado *</label>
              <MaskedInput mask="currency" value={form.principal_amount}
                onValueChange={v => setForm(f => ({ ...f, principal_amount: v }))}
                placeholder="0,00"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Taxa de Juros (%)</label>
              <MaskedInput mask="percent" value={form.interest_rate}
                onValueChange={v => setForm(f => ({ ...f, interest_rate: v }))}
                placeholder="10"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Juros</label>
              <select value={form.interest_type} onChange={e => setForm(f => ({ ...f, interest_type: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white">
                <option value="simple">Simples</option>
                <option value="compound">Composto</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Periodicidade</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white">
                <option value="daily">Diário</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Parcelas</label>
              <NumberStepper value={form.installments} min={1} max={360}
                onChange={v => setForm(f => ({ ...f, installments: v }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de Início</label>
              <input type="date" value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Venc. 1ª Parcela *</label>
              <input type="date" required value={form.first_due_date}
                onChange={e => setForm(f => ({ ...f, first_due_date: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white" />
            </div>
          </div>

          <div className="border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 bg-indigo-50 dark:bg-indigo-900/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Cobrança Automática via WhatsApp</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={form.auto_notify}
                  onChange={e => setForm(f => ({ ...f, auto_notify: e.target.checked }))}
                  className="sr-only peer" />
                <div className="w-10 h-5 bg-gray-300 dark:bg-gray-600 peer-focus:ring-2 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
              </label>
            </div>
            {form.auto_notify && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
                  <span>Notificar</span>
                  <NumberStepper value={form.notify_days_before} min={0} max={30}
                    onChange={v => setForm(f => ({ ...f, notify_days_before: v }))} />
                  <span>dia(s) antes + cobranças de vencidas</span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Mensagem personalizada (opcional)</label>
                  <textarea value={form.custom_message}
                    onChange={e => setForm(f => ({ ...f, custom_message: e.target.value }))}
                    rows={3}
                    placeholder="Ex: Olá {nome}, sua parcela de {valor} vence em {vencimento}. PIX: ..."
                    className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white resize-none" />
                  <p className="text-xs text-indigo-500 mt-1">Variáveis: {'{nome}'}, {'{valor}'}, {'{vencimento}'}, {'{parcela}'}</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observações</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Notas sobre o empréstimo..."
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModal(false)}
              className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2 rounded-lg font-medium">
              Cancelar
            </button>
            <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium">
              Criar Empréstimo
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal detalhe */}
      {detail && (
        <Modal open={detailModal} onClose={() => setDetailModal(false)}
          title={`Empréstimo — ${detail.contact_name || 'Sem nome'}`}>
          <div className="space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 dark:text-gray-400">Principal</div>
                <div className="font-bold text-gray-800 dark:text-white">{fmt(detail.principal_amount)}</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 dark:text-gray-400">Juros</div>
                <div className="font-bold text-gray-800 dark:text-white">{fmtRate(detail.interest_rate)}% / {freqLabel[detail.frequency]}</div>
                <div className="text-xs text-gray-400">{detail.interest_type === 'compound' ? 'Composto' : 'Simples'}</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 dark:text-gray-400">Em aberto</div>
                <div className="font-bold text-gray-800 dark:text-white">{fmt(detail.amount_remaining)}</div>
              </div>
            </div>

            {/* Ações */}
            {detail.status === 'active' && (
              <div className="flex gap-2">
                <button onClick={() => notifyOverdue(detail.id)}
                  className="flex-1 text-sm bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg font-medium">
                  📲 Cobrar Vencidas
                </button>
                <button onClick={() => updateStatus(detail.id, 'defaulted')}
                  className="text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-600 dark:text-gray-400 px-3 py-2 rounded-lg font-medium">
                  Inadimplente
                </button>
              </div>
            )}

            {/* Parcelas */}
            <div>
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Parcelas</h3>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {(detail.installments_list || []).map(inst => {
                  const overdue = !inst.paid && new Date(inst.due_date) < new Date()
                  const paidSoFar = parseFloat(inst.paid_amount || 0)
                  const totalAmount = parseFloat(inst.total_amount)
                  const totalDue = Math.max(0, totalAmount - paidSoFar)
                  return (
                    <div key={inst.id}
                      className={`flex items-center justify-between p-3 rounded-lg border text-sm
                        ${inst.paid ? 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800'
                          : overdue ? 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800'
                          : 'border-gray-200 bg-white dark:bg-gray-700 dark:border-gray-600'}`}>
                      <div>
                        <div className="font-medium text-gray-800 dark:text-white">
                          Parcela {inst.installment_number}
                          {inst.paid && <span className="ml-2 text-green-600 text-xs">✓ Paga</span>}
                          {overdue && <span className="ml-2 text-red-600 text-xs font-bold">VENCIDA</span>}
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 text-xs">
                          Venc: {fmtDate(inst.due_date)}
                          {paidSoFar > 0 && !inst.paid && (
                            <span className="text-green-600 ml-2">pago parcial: {fmt(paidSoFar)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="font-bold text-gray-800 dark:text-white">{fmt(totalDue)}</div>
                          {inst.paid && <div className="text-xs text-green-600">{fmtDate(inst.paid_at?.split('T')[0])}</div>}
                        </div>
                        {!inst.paid ? (
                          <div className="flex flex-col gap-1">
                            <button onClick={() => {
                              setSelectedInst(inst)
                              setPayAmount(totalDue.toFixed(2))
                              setPayModal(true)
                            }} className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded font-medium">
                              Pagar
                            </button>
                            <button onClick={() => notifyInstallment(inst)}
                              className="text-xs bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded font-medium">
                              📲
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => downloadReceipt(inst)}
                            className="text-xs border border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 px-2 py-1 rounded font-medium"
                            title="Baixar recibo">
                            📄 Recibo
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => deleteLoan(detail.id)}
                className="flex-1 text-sm border border-red-300 text-red-600 hover:bg-red-50 py-2 rounded-lg font-medium">
                Excluir
              </button>
              {detail.status !== 'paid' && (
                <button onClick={() => updateStatus(detail.id, 'paid')}
                  className="flex-1 text-sm bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium">
                  Marcar Quitado
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal pagamento */}
      <Modal open={payModal} onClose={() => setPayModal(false)} title="Registrar Pagamento">
        {selectedInst && (() => {
          const totalAmount = parseFloat(selectedInst.total_amount || 0)
          const alreadyPaid = parseFloat(selectedInst.paid_amount || 0)
          const remaining = Math.max(0, totalAmount - alreadyPaid)
          const typed = parseFloat(payAmount) || 0
          const afterPayment = Math.max(0, remaining - typed)
          return (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-gray-800 dark:text-white">
                  Parcela {selectedInst.installment_number} — venc. {fmtDate(selectedInst.due_date)}
                </p>
                <div className="flex justify-between text-gray-500 dark:text-gray-400">
                  <span>Total da parcela</span><span>{fmt(totalAmount)}</span>
                </div>
                {alreadyPaid > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Já pago</span><span>{fmt(alreadyPaid)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-gray-800 dark:text-white border-t border-gray-200 dark:border-gray-600 pt-1">
                  <span>Em aberto</span><span>{fmt(remaining)}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor Pago (pode ser parcial)</label>
                <MaskedInput mask="currency" value={payAmount}
                  onValueChange={v => setPayAmount(v)}
                  placeholder="0,00"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white" />
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setPayAmount(remaining.toFixed(2))}
                    className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded hover:bg-indigo-100">
                    Pagar tudo ({fmt(remaining)})
                  </button>
                  <button type="button" onClick={() => setPayAmount((remaining / 2).toFixed(2))}
                    className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded hover:bg-gray-200">
                    Metade
                  </button>
                </div>
                {typed > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Após este pagamento restarão <strong className={afterPayment === 0 ? 'text-green-600' : ''}>{fmt(afterPayment)}</strong> nesta parcela.
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPayModal(false)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2 rounded-lg font-medium">
                  Cancelar
                </button>
                <button onClick={handlePay}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium">
                  Confirmar Pagamento
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Modal Mensagem Padrão */}
      <Modal open={msgModal} onClose={() => setMsgModal(false)} title="Mensagem padrão de cobrança" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Essa mensagem é usada em todas as cobranças automáticas de empréstimos, e pré-preenche o campo
            "Mensagem personalizada" de novos empréstimos.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template</label>
            <textarea value={defaultMessage} onChange={e => setDefaultMessage(e.target.value)} rows={10}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              placeholder={templateDefault} />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">
                Variáveis: <code>{'{nome}'}</code>, <code>{'{valor}'}</code>, <code>{'{vencimento}'}</code>, <code>{'{parcela}'}</code>
              </p>
              <button onClick={resetDefaultMessage}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Restaurar padrão</button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setMsgModal(false)}
              className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancelar
            </button>
            <button onClick={saveDefaultMessage} disabled={savingMsg}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium">
              {savingMsg ? 'Salvando...' : 'Salvar mensagem'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover empréstimo"
        message={`Remover empréstimo de "${deleteConfirm?.contact_name || 'sem nome'}"? Parcelas e histórico serão apagados.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
        confirmLabel="Remover"
      />
    </div>
  )
}
