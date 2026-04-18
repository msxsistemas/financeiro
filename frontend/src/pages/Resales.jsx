import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '../api'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const emptyReseller = { server_id: '', name: '', phone: '', credit_quantity: '', credit_sell_value: '', notes: '' }

export default function Resales() {
  const [servers, setServers] = useState([])
  const [resellers, setResellers] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [resellerModal, setResellerModal] = useState(false)
  const [editReseller, setEditReseller] = useState(null)
  const [resellerForm, setResellerForm] = useState(emptyReseller)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [filterServer, setFilterServer] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [serversRes, resellersRes, statsRes] = await Promise.all([
        api.get('/api/iptv/servers'),
        api.get('/api/iptv/resellers'),
        api.get('/api/iptv/stats')
      ])
      setServers(serversRes.data)
      setResellers(resellersRes.data)
      setStats(statsRes.data)
    } catch { toast.error('Erro ao carregar dados') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = (serverId = '') => {
    setEditReseller(null)
    setResellerForm({ ...emptyReseller, server_id: serverId ? String(serverId) : '' })
    setResellerModal(true)
  }
  const openEdit = r => {
    setEditReseller(r)
    setResellerForm({
      server_id: r.server_id ? String(r.server_id) : '', name: r.name,
      phone: r.phone || '', credit_quantity: r.credit_quantity || '',
      credit_sell_value: r.credit_sell_value || '', notes: r.notes || ''
    })
    setResellerModal(true)
  }

  const save = async () => {
    if (!resellerForm.name || !resellerForm.server_id) return toast.error('Nome e servidor sao obrigatorios')
    setSaving(true)
    try {
      const payload = { ...resellerForm, credit_quantity: parseInt(resellerForm.credit_quantity) || 0, credit_sell_value: parseFloat(resellerForm.credit_sell_value) || 0 }
      if (editReseller) await api.put(`/api/iptv/resellers/${editReseller.id}`, payload)
      else await api.post('/api/iptv/resellers', payload)
      toast.success(editReseller ? 'Atualizado!' : 'Revendedor cadastrado!')
      setResellerModal(false); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/api/iptv/resellers/${confirmDelete.id}`)
      toast.success('Removido!')
      setConfirmDelete(null); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
  }

  const filtered = filterServer ? resellers.filter(r => String(r.server_id) === filterServer) : resellers
  const totalRevenue = filtered.reduce((s, r) => s + r.total_revenue, 0)
  const totalProfit = filtered.reduce((s, r) => s + r.profit, 0)
  const totalCredits = filtered.reduce((s, r) => s + r.credit_quantity, 0)

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Revendas IPTV</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Controle de revendedores, creditos e faturamento</p>
        </div>
        <button onClick={() => openNew()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Novo Revendedor</button>
      </div>

      {/* Cards faturamento */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Revendedores</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{filtered.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Creditos Vendidos</p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{totalCredits}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Faturamento Total</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{fmt(totalRevenue)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Lucro Liquido</p>
          <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{fmt(totalProfit)}</p>
          <p className="text-xs text-gray-400 mt-1">{totalRevenue > 0 ? `${((totalProfit / totalRevenue) * 100).toFixed(1)}% margem` : '—'}</p>
        </div>
      </div>

      {/* Filtro */}
      <div className="flex gap-3">
        <select value={filterServer} onChange={e => setFilterServer(e.target.value)}
          className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todos os servidores</option>
          {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {filterServer && (
          <button onClick={() => setFilterServer('')} className="text-xs text-gray-400 hover:text-red-500">Limpar filtro</button>
        )}
      </div>

      {/* Tabela revendedores */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
          <p className="text-4xl mb-3">🏪</p>
          <p className="text-gray-400 mb-4">Nenhum revendedor cadastrado</p>
          <button onClick={() => openNew()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm">+ Cadastrar Revendedor</button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Revendedor</th>
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Servidor</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Qtd Creditos</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Valor Venda/Cred</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Receita</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Custo</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Lucro</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 dark:text-white">{r.name}</p>
                    {r.phone && <p className="text-xs text-gray-400">{r.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.server_name || '—'}</td>
                  <td className="px-4 py-3 text-center font-medium text-indigo-600 dark:text-indigo-400">{r.credit_quantity}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{fmt(r.credit_sell_value)}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">{fmt(r.total_revenue)}</td>
                  <td className="px-4 py-3 text-right text-red-500">{fmt(r.total_cost)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(r.profit)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(r)} className="text-indigo-500 hover:text-indigo-700 mr-2 text-xs">✏️</button>
                    <button onClick={() => setConfirmDelete(r)} className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 dark:bg-gray-700/50 font-bold">
                <td className="px-4 py-3 text-gray-800 dark:text-white">TOTAL</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-center text-indigo-600 dark:text-indigo-400">{totalCredits}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right text-green-600">{fmt(totalRevenue)}</td>
                <td className="px-4 py-3 text-right text-red-500">{fmt(filtered.reduce((s, r) => s + r.total_cost, 0))}</td>
                <td className={`px-4 py-3 text-right ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(totalProfit)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Modal Revendedor */}
      <Modal open={resellerModal} onClose={() => setResellerModal(false)} title={editReseller ? 'Editar Revendedor' : 'Novo Revendedor'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Servidor *</label>
            <select value={resellerForm.server_id} onChange={e => setResellerForm(p => ({ ...p, server_id: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Selecione o servidor</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name} (custo: {fmt(s.credit_value)}/cred)</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do Revendedor *</label>
            <input value={resellerForm.name} onChange={e => setResellerForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Nome do revendedor" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telefone</label>
            <MaskedInput mask="phone" value={resellerForm.phone} onValueChange={v => setResellerForm(p => ({ ...p, phone: v }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="(11) 99999-9999" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Qtd Creditos</label>
              <input type="number" min="0" value={resellerForm.credit_quantity} onChange={e => setResellerForm(p => ({ ...p, credit_quantity: e.target.value }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor Venda/Cred (R$)</label>
              <MaskedInput mask="currency" value={resellerForm.credit_sell_value} onValueChange={v => setResellerForm(p => ({ ...p, credit_sell_value: v }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0,00" />
            </div>
          </div>
          {resellerForm.credit_quantity > 0 && resellerForm.credit_sell_value > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm">
              <p className="text-green-700 dark:text-green-400">
                Receita: <strong>{fmt(resellerForm.credit_quantity * resellerForm.credit_sell_value)}</strong>
                {resellerForm.server_id && (() => {
                  const sv = servers.find(s => String(s.id) === resellerForm.server_id)
                  if (!sv) return null
                  const cost = resellerForm.credit_quantity * sv.credit_value
                  const profit = (resellerForm.credit_quantity * resellerForm.credit_sell_value) - cost
                  return <span> | Custo: <strong className="text-red-500">{fmt(cost)}</strong> | Lucro: <strong className={profit >= 0 ? '' : 'text-red-500'}>{fmt(profit)}</strong></span>
                })()}
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observacoes</label>
            <textarea value={resellerForm.notes} onChange={e => setResellerForm(p => ({ ...p, notes: e.target.value }))} rows={2}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setResellerModal(false)} className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title="Excluir Revendedor"
        message={`Excluir "${confirmDelete?.name}"?`}
        onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  )
}
