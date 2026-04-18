import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '../api'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const statusLabel = { pending: 'Pendente', partial: 'Parcial', paid: 'Pago', overdue: 'Vencido' }
const statusColor = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  partial: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

export default function IPTVDebts() {
  const [debts, setDebts] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('receivable')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [resellers, setResellers] = useState([])

  const defaultForm = { name: '', phone: '', type: 'receivable', amount: '', due_date: '', no_due_date: false, notes: '', reseller_id: '' }
  const [form, setForm] = useState(defaultForm)
  const [payForm, setPayForm] = useState({ amount: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: tab })
      if (statusFilter) params.set('status', statusFilter)
      const [debtsRes, statsRes, resRes] = await Promise.all([
        api.get(`/api/iptv/debts?${params}`),
        api.get('/api/iptv/debts/stats'),
        api.get('/api/iptv/resellers')
      ])
      setDebts(debtsRes.data)
      setStats(statsRes.data)
      setResellers(resRes.data)
    } catch { toast.error('Erro ao carregar') }
    finally { setLoading(false) }
  }, [tab, statusFilter])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditing(null)
    setForm({ ...defaultForm, type: tab })
    setModal(true)
  }

  const openEdit = (d) => {
    setEditing(d)
    setForm({
      name: d.name, phone: d.phone || '', type: d.type,
      amount: d.amount,
      due_date: d.due_date ? d.due_date.substring(0, 10) : '',
      no_due_date: !d.due_date,
      notes: d.notes || '', reseller_id: d.reseller_id ? String(d.reseller_id) : ''
    })
    setModal(true)
  }

  const openPay = (d) => {
    setSelected(d)
    setPayForm({ amount: '' })
    setPayModal(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.amount) return toast.error('Nome e valor sao obrigatorios')
    setSaving(true)
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount),
        reseller_id: form.reseller_id || null,
        client_id: null,
        due_date: form.no_due_date ? null : (form.due_date || null)
      }
      delete payload.no_due_date
      if (editing) await api.put(`/api/iptv/debts/${editing.id}`, payload)
      else await api.post('/api/iptv/debts', payload)
      toast.success('Salvo!')
      setModal(false)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
    finally { setSaving(false) }
  }

  const handlePay = async () => {
    if (!payForm.amount || payForm.amount <= 0) return toast.error('Valor invalido')
    try {
      await api.post(`/api/iptv/debts/${selected.id}/pay`, { amount: parseFloat(payForm.amount) })
      toast.success('Pagamento registrado!')
      setPayModal(false)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro') }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/api/iptv/debts/${deleteConfirm.id}`)
      toast.success('Removido!')
      setDeleteConfirm(null)
      load()
    } catch { toast.error('Erro ao remover') }
  }

  const filtered = debts.map(d => {
    if (d.status !== 'paid' && d.due_date && new Date(d.due_date) < new Date()) return { ...d, status: 'overdue' }
    return d
  })

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dividas IPTV</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Cobranças de revendedores e clientes</p>
        </div>
        <button onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Nova Divida
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
            <p className="text-xs text-gray-500 dark:text-gray-400">Vencidas</p>
            <p className="text-xl font-bold text-orange-500">{stats.overdue_count}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b dark:border-gray-700">
        <button onClick={() => setTab('receivable')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'receivable' ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
          A Receber
        </button>
        <button onClick={() => setTab('payable')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'payable' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
          A Pagar
        </button>
      </div>

      {/* Filtro */}
      <div className="flex gap-2 flex-wrap">
        {['', 'pending', 'partial', 'overdue', 'paid'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-indigo-300'}`}>
            {s === '' ? 'Todos' : statusLabel[s]}
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-400">Nenhuma divida encontrada</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Nome</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Valor</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Pago</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Restante</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Vencimento</th>
                <th className="text-center px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 dark:text-white">{d.name}</p>
                    {d.phone && <p className="text-xs text-gray-400">{d.phone}</p>}
                    {d.notes && <p className="text-xs text-gray-400 truncate max-w-[200px]">{d.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">{fmt(d.amount)}</td>
                  <td className="px-4 py-3 text-right text-green-600">{fmt(d.paid_amount)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800 dark:text-white">{fmt(d.remaining)}</td>
                  <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400 text-xs">
                    {d.due_date ? new Date(d.due_date).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[d.status] || statusColor.pending}`}>
                      {statusLabel[d.status] || 'Pendente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    {d.status !== 'paid' && (
                      <button onClick={() => openPay(d)} className="text-green-500 hover:text-green-700 text-xs" title="Registrar pagamento">💰</button>
                    )}
                    <button onClick={() => openEdit(d)} className="text-indigo-500 hover:text-indigo-700 text-xs">✏️</button>
                    <button onClick={() => setDeleteConfirm(d)} className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Nova/Editar Divida */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar Divida' : 'Nova Divida'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="Nome do devedor" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telefone</label>
            <MaskedInput mask="phone" value={form.phone} onValueChange={v => setForm(p => ({ ...p, phone: v }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="(11) 99999-9999" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                <option value="receivable">A Receber</option>
                <option value="payable">A Pagar</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor *</label>
              <MaskedInput mask="currency" value={form.amount} onValueChange={v => setForm(p => ({ ...p, amount: v }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="0,00" />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input type="checkbox" checked={form.no_due_date}
                onChange={e => setForm(p => ({ ...p, no_due_date: e.target.checked, due_date: e.target.checked ? '' : p.due_date }))}
                className="w-4 h-4 text-indigo-600 rounded" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Sem vencimento</span>
            </label>
            {!form.no_due_date && (
              <>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vencimento</label>
                <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                  className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" />
              </>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Revendedor</label>
            <select value={form.reseller_id} onChange={e => setForm(p => ({ ...p, reseller_id: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm">
              <option value="">Nenhum</option>
              {resellers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observacoes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Pagamento */}
      <Modal open={payModal} onClose={() => setPayModal(false)} title="Registrar Pagamento" size="sm">
        {selected && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-800 dark:text-white">{selected.name}</p>
              <p className="text-xs text-gray-500">Total: {fmt(selected.amount)} | Pago: {fmt(selected.paid_amount)} | Restante: <strong>{fmt(selected.remaining)}</strong></p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor do pagamento</label>
              <MaskedInput mask="currency" value={payForm.amount} onValueChange={v => setPayForm({ amount: v })}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="0,00" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPayForm({ amount: selected.remaining })}
                className="text-xs text-indigo-600 hover:underline">Pagar tudo ({fmt(selected.remaining)})</button>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setPayModal(false)} className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm">Cancelar</button>
              <button onClick={handlePay} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium">Confirmar</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteConfirm} title="Excluir" message={`Excluir divida de "${deleteConfirm?.name}"?`}
        onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} />
    </div>
  )
}
