import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'
import NumberStepper from '../components/NumberStepper'

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const currentPeriod = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const currentYear = () => String(new Date().getFullYear())
const isYear = p => !!p && /^\d{4}$/.test(p)
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const periodLabel = p => {
  if (!p) return ''
  if (isYear(p)) return p
  const [y, m] = p.split('-')
  return `${MESES[parseInt(m) - 1]}/${y}`
}
const shiftPeriod = (p, delta) => {
  if (isYear(p)) {
    return String(parseInt(p) + delta)
  }
  const [y, m] = p.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function PeriodSelect({ period, setPeriod, compact = false }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex rounded-lg border dark:border-gray-600 overflow-hidden">
        <button onClick={() => setPeriod(currentPeriod())}
          className={`px-3 py-1.5 text-sm ${!isYear(period) ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>Mês</button>
        <button onClick={() => setPeriod(currentYear())}
          className={`px-3 py-1.5 text-sm ${isYear(period) ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>Ano</button>
      </div>
      <button onClick={() => setPeriod(shiftPeriod(period, -1))}
        className="border dark:border-gray-600 dark:text-gray-300 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
        title={isYear(period) ? 'Ano anterior' : 'Mês anterior'}>◀</button>
      <select value={period} onChange={e => setPeriod(e.target.value)}
        className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-1.5 text-sm">
        {isYear(period)
          ? Array.from({ length: 8 }, (_, i) => String(parseInt(currentYear()) + 2 - i)).map(p => (
              <option key={p} value={p}>{p}</option>
            ))
          : Array.from({ length: 24 }, (_, i) => shiftPeriod(currentPeriod(), 6 - i)).map(p => (
              <option key={p} value={p}>{periodLabel(p)}</option>
            ))
        }
      </select>
      <button onClick={() => setPeriod(shiftPeriod(period, 1))}
        className="border dark:border-gray-600 dark:text-gray-300 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
        title={isYear(period) ? 'Próximo ano' : 'Próximo mês'}>▶</button>
      {!compact && (isYear(period) ? period !== currentYear() : period !== currentPeriod()) && (
        <button onClick={() => setPeriod(isYear(period) ? currentYear() : currentPeriod())}
          className="text-xs text-indigo-600 hover:text-indigo-800 ml-1">Hoje</button>
      )}
    </div>
  )
}

export default function IPTV() {
  const { subtab } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState(subtab || 'servers')

  useEffect(() => { if (subtab && subtab !== tab) setTab(subtab) }, [subtab])

  const changeTab = (t) => {
    setTab(t)
    navigate(`/iptv/${t}`, { replace: true })
  }
  const [servers, setServers] = useState([])
  const [resellers, setResellers] = useState([])
  const [knownResellers, setKnownResellers] = useState([])
  const [myClients, setMyClients] = useState([])
  const [contacts, setContacts] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(currentPeriod())
  const [contactSearch, setContactSearch] = useState('')
  const [showContactList, setShowContactList] = useState(false)

  // Modais
  const [serverModal, setServerModal] = useState(false)
  const [resellerModal, setResellerModal] = useState(false)
  const [clientModal, setClientModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Forms
  const [serverForm, setServerForm] = useState({ name: '', credit_value: '' })
  const [resellerForm, setResellerForm] = useState({ server_id: '', contact_id: '', name: '', phone: '', credit_quantity: '', credit_sell_value: '', notes: '' })
  const [clientForm, setClientForm] = useState({ server_id: '', contact_id: '', name: '', phone: '', credit_quantity: '1', sell_value: '', notes: '' })

  // Filtros
  const [filterServer, setFilterServer] = useState('')

  // Lançamento rápido: mapa { "serverId:nameLower": qtdString }
  const [quickQty, setQuickQty] = useState({})
  const [quickSaving, setQuickSaving] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = `?period=${period}`
      const [srv, res, mc, st, kn] = await Promise.all([
        api.get(`/api/iptv/servers${q}`), api.get(`/api/iptv/resellers${q}`),
        api.get(`/api/iptv/my-clients${q}`), api.get(`/api/iptv/stats${q}`),
        api.get(`/api/iptv/resellers/known${q}`)
      ])
      setServers(srv.data); setResellers(res.data); setMyClients(mc.data); setStats(st.data)
      setKnownResellers(kn.data || [])
    } catch { toast.error('Erro ao carregar dados') }
    finally { setLoading(false) }
  }, [period])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get('/api/contacts?limit=300').then(r => setContacts(r.data.data || [])).catch(() => {})
  }, [])

  const filteredContacts = contacts.filter(c =>
    c.name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.phone?.includes(contactSearch)
  ).slice(0, 8)

  const duplicatePrevMonth = async (kind) => {
    try {
      const from = shiftPeriod(period, -1)
      const { data } = await api.post(`/api/iptv/${kind}/duplicate`, { from_period: from, to_period: period })
      toast.success(`${data.inserted} linha(s) copiadas de ${periodLabel(from)}`)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao duplicar') }
  }

  // ── Server CRUD
  const openNewServer = () => { setEditItem(null); setServerForm({ name: '', credit_value: '' }); setServerModal(true) }
  const openEditServer = s => { setEditItem(s); setServerForm({ name: s.name, credit_value: s.credit_value || '' }); setServerModal(true) }
  const saveServer = async () => {
    if (!serverForm.name) return toast.error('Nome obrigatorio')
    setSaving(true)
    try {
      const p = { ...serverForm, credit_value: parseFloat(serverForm.credit_value) || 0 }
      if (editItem) await api.put(`/api/iptv/servers/${editItem.id}`, p)
      else await api.post('/api/iptv/servers', p)
      toast.success('Salvo!'); setServerModal(false); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  // ── Reseller CRUD
  const openNewReseller = () => {
    setEditItem(null)
    setResellerForm({ server_id: '', contact_id: '', name: '', phone: '', credit_quantity: '', credit_sell_value: '', notes: '' })
    setContactSearch('')
    setResellerModal(true)
  }
  const openEditReseller = r => {
    setEditItem(r)
    setResellerForm({
      server_id: String(r.server_id || ''),
      contact_id: '', // agenda não é linkada explicitamente, match é por nome
      name: r.name, phone: r.phone || '',
      credit_quantity: r.credit_quantity || '',
      credit_sell_value: r.credit_sell_value || '',
      notes: r.notes || ''
    })
    setContactSearch(r.name || '')
    setResellerModal(true)
  }
  const saveReseller = async () => {
    const name = (resellerForm.name || contactSearch || '').trim()
    if (!name || !resellerForm.server_id) return toast.error('Nome e servidor obrigatórios')
    setSaving(true)
    try {
      const p = {
        server_id: resellerForm.server_id,
        name,
        phone: resellerForm.phone || null,
        credit_quantity: parseInt(resellerForm.credit_quantity) || 0,
        credit_sell_value: parseFloat(resellerForm.credit_sell_value) || 0,
        notes: resellerForm.notes || null,
        // No modo anual, não escolhemos mês específico — nova linha sempre vai pro mês corrente
        period: isYear(period) ? currentPeriod() : period
      }
      if (editItem) await api.put(`/api/iptv/resellers/${editItem.id}`, p)
      else await api.post('/api/iptv/resellers', p)
      // Atualiza cache de contatos (backend já criou se era novo)
      api.get('/api/contacts?limit=300').then(r => setContacts(r.data.data || [])).catch(() => {})
      toast.success('Salvo!'); setResellerModal(false); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  // Lançamento rápido: cria linha no mês corrente reusando dados do revendedor
  const quickLaunch = async (known) => {
    const key = `${known.server_id}:${(known.name || '').toLowerCase()}`
    const raw = quickQty[key]
    const qty = parseInt(raw)
    if (!raw || isNaN(qty) || qty < 0) return toast.error('Informe a quantidade')
    setQuickSaving(key)
    try {
      await api.post('/api/iptv/resellers', {
        server_id: known.server_id,
        name: known.name,
        phone: known.phone || null,
        credit_quantity: qty,
        credit_sell_value: parseFloat(known.credit_sell_value) || 0,
        notes: known.notes || null,
        period: isYear(period) ? currentPeriod() : period
      })
      toast.success(`${known.name} lançado!`)
      setQuickQty(p => { const n = { ...p }; delete n[key]; return n })
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setQuickSaving(null) }
  }

  // Pré-preenche o modal a partir de um revendedor conhecido
  const prefillFromKnown = (known) => {
    setResellerForm({
      server_id: String(known.server_id || ''),
      contact_id: '',
      name: known.name,
      phone: known.phone || '',
      credit_quantity: String(known.last_quantity || ''),
      credit_sell_value: known.credit_sell_value != null ? String(parseFloat(known.credit_sell_value)) : '',
      notes: known.notes || ''
    })
    setContactSearch(known.name || '')
  }

  // ── My Client CRUD
  const openNewClient = () => {
    setEditItem(null)
    setClientForm({ server_id: '', contact_id: '', name: '', phone: '', credit_quantity: '1', sell_value: '', notes: '' })
    setContactSearch('')
    setClientModal(true)
  }
  const openEditClient = c => {
    setEditItem(c)
    setClientForm({
      server_id: String(c.server_id || ''),
      contact_id: '',
      name: c.name || '', phone: c.phone || '',
      credit_quantity: String(c.credit_quantity || 1),
      sell_value: c.sell_value != null ? String(parseFloat(c.sell_value)) : '',
      notes: c.notes || ''
    })
    setContactSearch(c.name || '')
    setClientModal(true)
  }
  const saveClient = async () => {
    const name = (clientForm.name || contactSearch || '').trim()
    if (!name || !clientForm.server_id) return toast.error('Nome e servidor obrigatórios')
    setSaving(true)
    try {
      const p = {
        server_id: clientForm.server_id,
        name,
        phone: clientForm.phone || null,
        credit_quantity: parseInt(clientForm.credit_quantity) || 1,
        sell_value: parseFloat(clientForm.sell_value) || 0,
        notes: clientForm.notes || null,
        period: isYear(period) ? currentPeriod() : period
      }
      if (editItem) await api.put(`/api/iptv/my-clients/${editItem.id}`, p)
      else await api.post('/api/iptv/my-clients', p)
      api.get('/api/contacts?limit=300').then(r => setContacts(r.data.data || [])).catch(() => {})
      toast.success('Salvo!'); setClientModal(false); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  // ── Delete
  const handleDelete = async () => {
    const { type, id } = confirmDelete
    try {
      await api.delete(`/api/iptv/${type}/${id}`)
      toast.success('Removido!'); setConfirmDelete(null); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
  }

  const filteredResellers = filterServer ? resellers.filter(r => String(r.server_id) === filterServer) : resellers
  const filteredClients = filterServer ? myClients.filter(c => String(c.server_id) === filterServer) : myClients

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">IPTV</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{periodLabel(period)}</p>
        </div>
      </div>

      {/* Cards contextuais por aba */}
      {stats && tab === 'servers' && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Servidores</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.servers_tab?.servers_count ?? stats.total_servers}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Créditos ativos</p>
            <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{stats.servers_tab?.total_credits ?? 0}</p>
            <p className="text-xs text-gray-400">revendas + clientes</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Faturamento</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{fmt(stats.servers_tab?.revenue ?? 0)}</p>
            <p className="text-xs text-gray-400">Custo: {fmt(stats.servers_tab?.cost ?? 0)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 col-span-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">Lucro Líquido</p>
            <p className={`text-xl font-bold ${(stats.servers_tab?.profit ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{fmt(stats.servers_tab?.profit ?? 0)}</p>
            <p className="text-xs text-gray-400">{(stats.servers_tab?.margin ?? 0).toFixed(1)}% margem</p>
          </div>
        </div>
      )}

      {stats && tab === 'resellers' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Revendedores</p>
            <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{stats.resellers_tab?.count ?? 0}</p>
            <p className="text-xs text-gray-400">{stats.resellers_tab?.credits_sold ?? 0} créditos</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Faturamento</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{fmt(stats.resellers_tab?.revenue ?? 0)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Custo</p>
            <p className="text-xl font-bold text-red-500">{fmt(stats.resellers_tab?.cost ?? 0)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Lucro Líquido</p>
            <p className={`text-xl font-bold ${(stats.resellers_tab?.profit ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{fmt(stats.resellers_tab?.profit ?? 0)}</p>
            <p className="text-xs text-gray-400">{(stats.resellers_tab?.margin ?? 0).toFixed(1)}% margem</p>
          </div>
        </div>
      )}

      {stats && tab === 'my-clients' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Clientes</p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.my_clients_tab?.count ?? 0}</p>
            <p className="text-xs text-gray-400">{myClients.length} servidor(es)</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Faturamento</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{fmt(stats.my_clients_tab?.revenue ?? 0)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Custo</p>
            <p className="text-xl font-bold text-red-500">{fmt(stats.my_clients_tab?.cost ?? 0)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Lucro Líquido</p>
            <p className={`text-xl font-bold ${(stats.my_clients_tab?.profit ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{fmt(stats.my_clients_tab?.profit ?? 0)}</p>
            <p className="text-xs text-gray-400">{(stats.my_clients_tab?.margin ?? 0).toFixed(1)}% margem</p>
          </div>
        </div>
      )}


      {/* ══════ TAB: SERVIDORES & APPS ══════ */}
      {tab === 'servers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <PeriodSelect period={period} setPeriod={setPeriod} />
            <button onClick={openNewServer} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Novo Servidor</button>
          </div>
          {servers.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
              <p className="text-4xl mb-3">📺</p>
              <p className="text-gray-400 mb-4">Nenhum servidor cadastrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {servers.map(s => (
                <div key={s.id} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{s.name}</h3>
                    <div className="flex gap-2">
                      <button onClick={() => openEditServer(s)} className="text-indigo-500 hover:text-indigo-700 text-sm">✏️</button>
                      <button onClick={() => setConfirmDelete({ type: 'servers', id: s.id, name: s.name })} className="text-red-400 hover:text-red-600 text-sm">🗑️</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center mb-3">
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{s.max_clients}</p>
                      <p className="text-xs text-gray-400">Clientes</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
                      <p className="text-sm font-bold text-gray-600 dark:text-gray-300">{fmt(s.credit_value)}</p>
                      <p className="text-xs text-gray-400">Valor Credito</p>
                    </div>
                  </div>
                  <div className="pt-3 border-t dark:border-gray-700 flex justify-between text-xs">
                    <span className="text-green-600">Receita: {fmt(s.total_revenue)}</span>
                    <span className={`font-bold ${s.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>Lucro: {fmt(s.profit)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════ TAB: REVENDAS ══════ */}
      {tab === 'resellers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <select value={filterServer} onChange={e => setFilterServer(e.target.value)}
                className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                <option value="">Todos os servidores</option>
                {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <PeriodSelect period={period} setPeriod={setPeriod} />
            </div>
            <div className="flex gap-2">
              {resellers.length === 0 && !isYear(period) && (
                <button onClick={() => duplicatePrevMonth('resellers')}
                  className="border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 px-3 py-2 rounded-lg text-sm">
                  📋 Copiar {periodLabel(shiftPeriod(period, -1))}
                </button>
              )}
              <button onClick={openNewReseller} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Novo Revendedor</button>
            </div>
          </div>

          {/* Lançamento rápido — revendedores já cadastrados mas sem lançamento no mês */}
          {!isYear(period) && (() => {
            const pending = knownResellers.filter(k =>
              !k.has_current_entry &&
              (!filterServer || String(k.server_id) === filterServer)
            )
            if (pending.length === 0) return null
            return (
              <div className="bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                      ⚡ Lançamento rápido de {periodLabel(period)}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {pending.length} revendedor(es) cadastrado(s) sem lançamento neste mês — informe só a quantidade
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {pending.map(k => {
                    const key = `${k.server_id}:${(k.name || '').toLowerCase()}`
                    const qty = quickQty[key] ?? ''
                    const isSaving = quickSaving === key
                    return (
                      <div key={key} className="border dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-700/30">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800 dark:text-white truncate">{k.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {k.server_name} · {fmt(k.credit_sell_value)}/cred
                            </p>
                          </div>
                          {k.last_quantity > 0 && (
                            <span className="text-[10px] shrink-0 px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                              últ.: {k.last_quantity}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number" min="0" inputMode="numeric"
                            placeholder={k.last_quantity > 0 ? `Qtd (ex: ${k.last_quantity})` : 'Qtd'}
                            value={qty}
                            onChange={e => setQuickQty(p => ({ ...p, [key]: e.target.value.replace(/\D/g, '') }))}
                            onKeyDown={e => { if (e.key === 'Enter') quickLaunch(k) }}
                            className="flex-1 min-w-0 border dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg px-3 py-1.5 text-sm" />
                          <button
                            onClick={() => quickLaunch(k)}
                            disabled={isSaving || !qty}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap">
                            {isSaving ? '...' : 'Lançar'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Top 5 revendedores que mais compraram no período */}
          {filteredResellers.length > 0 && (() => {
            const top = [...filteredResellers]
              .sort((a, b) => parseFloat(b.total_revenue || 0) - parseFloat(a.total_revenue || 0))
              .slice(0, 5)
            const max = parseFloat(top[0]?.total_revenue || 0) || 1
            const medals = ['🥇', '🥈', '🥉', '4º', '5º']
            return (
              <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-900/20 dark:to-gray-800 border border-indigo-100 dark:border-indigo-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800 dark:text-white">🏆 Top 5 em {periodLabel(period)}</h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{filteredResellers.length} revendedor(es){filterServer ? ' filtrados' : ''}</span>
                </div>
                <div className="space-y-2">
                  {top.map((r, i) => {
                    const rev = parseFloat(r.total_revenue || 0)
                    const pct = (rev / max) * 100
                    return (
                      <div key={r.id} className="flex items-center gap-3">
                        <span className="w-8 text-sm text-center font-semibold text-gray-600 dark:text-gray-300">{medals[i]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-medium text-gray-800 dark:text-white truncate">{r.name}</span>
                            <span className="text-sm font-bold text-green-600 shrink-0">{fmt(rev)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-indigo-500 h-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 shrink-0">{r.credit_quantity} cred.</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
          {filteredResellers.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
              <p className="text-4xl mb-3">🏪</p>
              <p className="text-gray-400">Nenhum revendedor</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Revendedor</th>
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Servidor</th>
                    <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Creditos</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Venda/Cred</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Receita</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Lucro</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResellers.map(r => (
                    <tr key={r.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3"><p className="font-medium text-gray-800 dark:text-white">{r.name}</p>{r.phone && <p className="text-xs text-gray-400">{r.phone}</p>}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.server_name || '—'}</td>
                      <td className="px-4 py-3 text-center font-medium text-indigo-600 dark:text-indigo-400">{r.credit_quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt(r.credit_sell_value)}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">{fmt(r.total_revenue)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(r.profit)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEditReseller(r)} className="text-indigo-500 hover:text-indigo-700 mr-2 text-xs">✏️</button>
                        <button onClick={() => setConfirmDelete({ type: 'resellers', id: r.id, name: r.name })} className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════ TAB: MEUS CLIENTES ══════ */}
      {tab === 'my-clients' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <select value={filterServer} onChange={e => setFilterServer(e.target.value)}
                className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                <option value="">Todos os servidores</option>
                {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <PeriodSelect period={period} setPeriod={setPeriod} />
            </div>
            <div className="flex gap-2">
              {myClients.length === 0 && !isYear(period) && (
                <button onClick={() => duplicatePrevMonth('my-clients')}
                  className="border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 px-3 py-2 rounded-lg text-sm">
                  📋 Copiar {periodLabel(shiftPeriod(period, -1))}
                </button>
              )}
              <button onClick={openNewClient} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Novo Cliente</button>
            </div>
          </div>
          {filteredClients.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
              <p className="text-4xl mb-3">📺</p>
              <p className="text-gray-400">Nenhum servidor cadastrado</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Cliente</th>
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Servidor</th>
                    <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Qtd</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Valor/cliente</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Receita</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Lucro</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map(c => (
                    <tr key={c.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 dark:text-white">{c.name || '—'}</p>
                        {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.server_name || '—'}</td>
                      <td className="px-4 py-3 text-center font-bold text-blue-600 dark:text-blue-400">{c.credit_quantity || 0}</td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt(c.sell_value)}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">{fmt(c.total_revenue)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${c.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(c.profit)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEditClient(c)} className="text-indigo-500 hover:text-indigo-700 mr-2 text-xs">✏️</button>
                        <button onClick={() => setConfirmDelete({ type: 'my-clients', id: c.id, name: c.name || 'cliente' })} className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  Total de clientes: <strong className="text-blue-600 dark:text-blue-400">
                    {filteredClients.reduce((s, c) => s + (parseInt(c.credit_quantity) || 0), 0)}
                  </strong>
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  Receita: <strong className="text-green-600">
                    {fmt(filteredClients.reduce((s, c) => s + (parseFloat(c.total_revenue) || 0), 0))}
                  </strong>
                  {' · '}
                  Lucro: <strong className="text-emerald-600">
                    {fmt(filteredClients.reduce((s, c) => s + (parseFloat(c.profit) || 0), 0))}
                  </strong>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════ MODAIS ══════ */}

      {/* Servidor */}
      <Modal open={serverModal} onClose={() => setServerModal(false)} title={editItem ? 'Editar Servidor' : 'Novo Servidor'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
            <input value={serverForm.name} onChange={e => setServerForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="Nome do servidor ou app" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor do Credito (R$)</label>
            <MaskedInput mask="currency" value={serverForm.credit_value} onValueChange={v => setServerForm(p => ({ ...p, credit_value: v }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="0,00" />
            <p className="text-xs text-gray-400 mt-1">Seu custo por credito neste servidor</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setServerModal(false)} className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm">Cancelar</button>
            <button onClick={saveServer} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </Modal>

      {/* Revendedor */}
      <Modal open={resellerModal} onClose={() => setResellerModal(false)} title={editItem ? 'Editar Revendedor' : 'Novo Revendedor'} size="sm">
        <div className="space-y-4">
          {!editItem && knownResellers.length > 0 && (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3">
              <label className="block text-xs font-medium text-indigo-800 dark:text-indigo-300 mb-1">
                ⚡ Usar revendedor já cadastrado
              </label>
              <select
                onChange={e => {
                  if (!e.target.value) return
                  const k = knownResellers.find(x => `${x.server_id}:${x.name.toLowerCase()}` === e.target.value)
                  if (k) prefillFromKnown(k)
                  e.target.value = ''
                }}
                defaultValue=""
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                <option value="">Selecione para preencher automaticamente…</option>
                {knownResellers.map(k => {
                  const key = `${k.server_id}:${k.name.toLowerCase()}`
                  return (
                    <option key={key} value={key}>
                      {k.name} — {k.server_name} · {fmt(k.credit_sell_value)}/cred
                      {k.has_current_entry ? ' (já lançado)' : ''}
                    </option>
                  )
                })}
              </select>
              <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-1">
                Cadastre 1 vez — nos próximos meses é só ajustar a quantidade.
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Servidor *</label>
            <select value={resellerForm.server_id} onChange={e => setResellerForm(p => ({ ...p, server_id: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm">
              <option value="">Selecione</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({fmt(s.credit_value)}/cred)</option>)}
            </select>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
            <div className="relative">
              <input
                value={resellerForm.name || contactSearch}
                onChange={e => {
                  const v = e.target.value
                  setContactSearch(v)
                  setResellerForm(p => ({ ...p, name: v }))
                  setShowContactList(true)
                }}
                onFocus={() => setShowContactList(true)}
                placeholder="Digite — será buscado na agenda"
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm pr-8" />
              {resellerForm.name && (
                <button type="button"
                  onClick={() => { setResellerForm(p => ({ ...p, name: '', phone: '' })); setContactSearch(''); setShowContactList(false) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 text-xs">✕</button>
              )}
            </div>
            {showContactList && contactSearch.length > 0 && filteredContacts.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {filteredContacts.map(c => (
                  <button type="button" key={c.id}
                    onClick={() => {
                      setResellerForm(p => ({ ...p, name: c.name, phone: c.phone || '' }))
                      setContactSearch(c.name); setShowContactList(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 text-sm flex items-center justify-between">
                    <span className="font-medium dark:text-white">{c.name}</span>
                    {c.phone && <span className="text-gray-400 text-xs">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">WhatsApp</label>
            <MaskedInput mask="phone" value={resellerForm.phone} onValueChange={v => setResellerForm(p => ({ ...p, phone: v }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="(11) 99999-9999" />
            <p className="text-xs text-gray-400 mt-1">Se o nome não existir na agenda, um novo contato é criado.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Qtd Creditos</label>
              <NumberStepper value={String(resellerForm.credit_quantity || 0)} min={0} max={9999}
                onChange={v => setResellerForm(p => ({ ...p, credit_quantity: v }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor Venda/Cred</label>
              <MaskedInput mask="currency" value={resellerForm.credit_sell_value} onValueChange={v => setResellerForm(p => ({ ...p, credit_sell_value: v }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="0,00" />
            </div>
          </div>
          {resellerForm.credit_quantity > 0 && resellerForm.credit_sell_value > 0 && resellerForm.server_id && (() => {
            const sv = servers.find(s => String(s.id) === resellerForm.server_id)
            if (!sv) return null
            const rev = resellerForm.credit_quantity * resellerForm.credit_sell_value
            const cost = resellerForm.credit_quantity * sv.credit_value
            return (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-400">
                Receita: <strong>{fmt(rev)}</strong> | Custo: <strong className="text-red-500">{fmt(cost)}</strong> | Lucro: <strong>{fmt(rev - cost)}</strong>
              </div>
            )
          })()}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setResellerModal(false)} className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm">Cancelar</button>
            <button onClick={saveReseller} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </Modal>

      {/* Cliente direto (Meus Servidores) */}
      <Modal open={clientModal} onClose={() => setClientModal(false)} title={editItem ? 'Editar cliente' : 'Novo cliente'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Servidor *</label>
            <select value={clientForm.server_id} onChange={e => setClientForm(p => ({ ...p, server_id: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm">
              <option value="">Selecione</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
            <div className="relative">
              <input
                value={clientForm.name || contactSearch}
                onChange={e => {
                  const v = e.target.value
                  setContactSearch(v)
                  setClientForm(p => ({ ...p, name: v }))
                  setShowContactList(true)
                }}
                onFocus={() => setShowContactList(true)}
                placeholder="Digite — será buscado na agenda"
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm pr-8" />
              {clientForm.name && (
                <button type="button"
                  onClick={() => { setClientForm(p => ({ ...p, name: '', phone: '' })); setContactSearch(''); setShowContactList(false) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 text-xs">✕</button>
              )}
            </div>
            {showContactList && contactSearch.length > 0 && filteredContacts.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {filteredContacts.map(c => (
                  <button type="button" key={c.id}
                    onClick={() => {
                      setClientForm(p => ({ ...p, name: c.name, phone: c.phone || '' }))
                      setContactSearch(c.name); setShowContactList(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 text-sm flex items-center justify-between">
                    <span className="font-medium dark:text-white">{c.name}</span>
                    {c.phone && <span className="text-gray-400 text-xs">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">WhatsApp</label>
            <MaskedInput mask="phone" value={clientForm.phone} onValueChange={v => setClientForm(p => ({ ...p, phone: v }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="(11) 99999-9999" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Qtd. de clientes</label>
              <NumberStepper value={clientForm.credit_quantity} min={0} max={99999}
                onChange={v => setClientForm(p => ({ ...p, credit_quantity: v }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor mensal/cliente</label>
              <MaskedInput mask="currency" value={clientForm.sell_value}
                onValueChange={v => setClientForm(p => ({ ...p, sell_value: v }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="0,00" />
            </div>
          </div>
          {clientForm.credit_quantity > 0 && clientForm.sell_value > 0 && clientForm.server_id && (() => {
            const sv = servers.find(s => String(s.id) === clientForm.server_id)
            if (!sv) return null
            const qtd = parseInt(clientForm.credit_quantity) || 0
            const val = parseFloat(clientForm.sell_value) || 0
            const rev = qtd * val
            const cost = qtd * (parseFloat(sv.credit_value) || 0)
            return (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-400">
                Receita: <strong>{fmt(rev)}</strong> | Custo: <strong className="text-red-500">{fmt(cost)}</strong> | Lucro: <strong>{fmt(rev - cost)}</strong>
              </div>
            )
          })()}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observações</label>
            <textarea value={clientForm.notes} onChange={e => setClientForm(p => ({ ...p, notes: e.target.value }))} rows={2}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm resize-none"
              placeholder="Opcional" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setClientModal(false)} className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm">Cancelar</button>
            <button onClick={saveClient} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title="Excluir" message={`Excluir "${confirmDelete?.name}"?`}
        onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  )
}
