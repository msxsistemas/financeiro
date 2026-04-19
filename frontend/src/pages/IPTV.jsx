import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'
import NumberStepper from '../components/NumberStepper'

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

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
  const [myClients, setMyClients] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  // Modais
  const [serverModal, setServerModal] = useState(false)
  const [resellerModal, setResellerModal] = useState(false)
  const [clientModal, setClientModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Forms
  const [serverForm, setServerForm] = useState({ name: '', credit_value: '' })
  const [resellerForm, setResellerForm] = useState({ server_id: '', name: '', phone: '', credit_quantity: '', credit_sell_value: '', notes: '' })
  const [clientForm, setClientForm] = useState({ server_id: '', credit_quantity: '1', notes: '' })

  // Filtros
  const [filterServer, setFilterServer] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [srv, res, mc, st] = await Promise.all([
        api.get('/api/iptv/servers'), api.get('/api/iptv/resellers'),
        api.get('/api/iptv/my-clients'), api.get('/api/iptv/stats')
      ])
      setServers(srv.data); setResellers(res.data); setMyClients(mc.data); setStats(st.data)
    } catch { toast.error('Erro ao carregar dados') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

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
  const openNewReseller = () => { setEditItem(null); setResellerForm({ server_id: '', name: '', phone: '', credit_quantity: '', credit_sell_value: '', notes: '' }); setResellerModal(true) }
  const openEditReseller = r => { setEditItem(r); setResellerForm({ server_id: String(r.server_id || ''), name: r.name, phone: r.phone || '', credit_quantity: r.credit_quantity || '', credit_sell_value: r.credit_sell_value || '', notes: r.notes || '' }); setResellerModal(true) }
  const saveReseller = async () => {
    if (!resellerForm.name || !resellerForm.server_id) return toast.error('Nome e servidor obrigatorios')
    setSaving(true)
    try {
      const p = { ...resellerForm, credit_quantity: parseInt(resellerForm.credit_quantity) || 0, credit_sell_value: parseFloat(resellerForm.credit_sell_value) || 0 }
      if (editItem) await api.put(`/api/iptv/resellers/${editItem.id}`, p)
      else await api.post('/api/iptv/resellers', p)
      toast.success('Salvo!'); setResellerModal(false); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  // ── My Client CRUD
  const openNewClient = () => { setEditItem(null); setClientForm({ server_id: '', credit_quantity: '1', notes: '' }); setClientModal(true) }
  const openEditClient = c => { setEditItem(c); setClientForm({ server_id: String(c.server_id || ''), credit_quantity: String(c.credit_quantity || 1), notes: c.notes || '' }); setClientModal(true) }
  const saveClient = async () => {
    if (!clientForm.server_id) return toast.error('Selecione um servidor')
    setSaving(true)
    try {
      const srv = servers.find(s => String(s.id) === String(clientForm.server_id))
      const p = {
        server_id: clientForm.server_id,
        name: srv?.name || 'Servidor',
        credit_quantity: parseInt(clientForm.credit_quantity) || 1,
        sell_value: 0,
        notes: clientForm.notes || null
      }
      if (editItem) await api.put(`/api/iptv/my-clients/${editItem.id}`, p)
      else await api.post('/api/iptv/my-clients', p)
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
          <p className="text-gray-500 dark:text-gray-400 text-sm">Servidores, revendas e clientes</p>
        </div>
      </div>

      {/* Faturamento cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Servidores</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total_servers}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Revendedores</p>
            <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{stats.total_resellers}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Meus Servidores</p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{myClients.length}</p>
            <p className="text-xs text-gray-400">{stats.total_my_clients} clientes</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Faturamento</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{fmt(stats.total_revenue)}</p>
            <p className="text-xs text-gray-400">Custo: {fmt(stats.total_cost)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Lucro Liquido</p>
            <p className={`text-xl font-bold ${stats.total_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{fmt(stats.total_profit)}</p>
            <p className="text-xs text-gray-400">{stats.margin.toFixed(1)}% margem</p>
          </div>
        </div>
      )}


      {/* ══════ TAB: SERVIDORES & APPS ══════ */}
      {tab === 'servers' && (
        <div className="space-y-4">
          <div className="flex justify-end">
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
            <select value={filterServer} onChange={e => setFilterServer(e.target.value)}
              className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm">
              <option value="">Todos os servidores</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={openNewReseller} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Novo Revendedor</button>
          </div>
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
          <div className="flex justify-end">
            <button onClick={openNewClient} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Novo Servidor</button>
          </div>
          {myClients.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
              <p className="text-4xl mb-3">📺</p>
              <p className="text-gray-400">Nenhum servidor cadastrado</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Servidor</th>
                    <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Clientes</th>
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Observações</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {myClients.map(c => (
                    <tr key={c.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{c.server_name || '—'}</td>
                      <td className="px-4 py-3 text-center font-bold text-blue-600 dark:text-blue-400">{c.credit_quantity || 0}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs truncate max-w-xs">{c.notes || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEditClient(c)} className="text-indigo-500 hover:text-indigo-700 mr-2 text-xs">✏️</button>
                        <button onClick={() => setConfirmDelete({ type: 'my-clients', id: c.id, name: c.server_name || 'servidor' })} className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex justify-end text-sm">
                <span className="text-gray-500 dark:text-gray-400">Total de clientes: </span>
                <strong className="ml-2 text-blue-600 dark:text-blue-400">
                  {myClients.reduce((s, c) => s + (parseInt(c.credit_quantity) || 0), 0)}
                </strong>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Servidor *</label>
            <select value={resellerForm.server_id} onChange={e => setResellerForm(p => ({ ...p, server_id: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm">
              <option value="">Selecione</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({fmt(s.credit_value)}/cred)</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
            <input value={resellerForm.name} onChange={e => setResellerForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="Nome do revendedor" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telefone</label>
            <MaskedInput mask="phone" value={resellerForm.phone} onValueChange={v => setResellerForm(p => ({ ...p, phone: v }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="(11) 99999-9999" />
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

      {/* Meu Servidor */}
      <Modal open={clientModal} onClose={() => setClientModal(false)} title={editItem ? 'Editar servidor' : 'Novo servidor'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Servidor *</label>
            <select value={clientForm.server_id} onChange={e => setClientForm(p => ({ ...p, server_id: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm">
              <option value="">Selecione</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quantidade de clientes</label>
            <NumberStepper value={clientForm.credit_quantity} min={0} max={99999}
              onChange={v => setClientForm(p => ({ ...p, credit_quantity: v }))} />
          </div>
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
