import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'
import api from '../api'

const typeLabel = { client: 'Cliente', supplier: 'Fornecedor' }
const typeColor = {
  client: 'bg-blue-100 text-blue-700',
  supplier: 'bg-purple-100 text-purple-700'
}

const defaultForm = { name: '', phone: '', email: '', cpf_cnpj: '', type: 'client', notes: '', address: '', city: '', state: '', zip_code: '' }

export default function Contacts() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [historyModal, setHistoryModal] = useState(false)
  const [historyData, setHistoryData] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: 100 })
      if (search) params.set('search', search)
      if (typeFilter) params.set('type', typeFilter)
      const { data } = await api.get(`/api/contacts?${params}`)
      setItems(data.data)
      setTotal(data.total)
    } catch { toast.error('Erro ao carregar contatos') }
    finally { setLoading(false) }
  }, [search, typeFilter])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(defaultForm); setModal(true) }
  const openEdit = (item) => {
    setEditing(item)
    setForm({ name: item.name, phone: item.phone || '', email: item.email || '',
      cpf_cnpj: item.cpf_cnpj || '', type: item.type, notes: item.notes || '',
      address: item.address || '', city: item.city || '', state: item.state || '', zip_code: item.zip_code || '' })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.name) return toast.error('Nome é obrigatório')
    if (form.phone) {
      const digits = form.phone.replace(/\D/g, '')
      if (digits.length > 0 && (digits.length < 10 || digits.length > 11)) {
        return toast.error('Telefone inválido. Use o formato (XX) XXXXX-XXXX')
      }
    }
    try {
      if (editing) {
        await api.put(`/api/contacts/${editing.id}`, form)
        toast.success('Contato atualizado!')
      } else {
        await api.post('/api/contacts', form)
        toast.success('Contato criado!')
      }
      setModal(false); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao salvar') }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/contacts/${id}`)
      toast.success('Removido!')
      setDeleteConfirm(null); load()
    } catch { toast.error('Erro ao remover') }
  }

  const handleWhatsApp = (phone) => {
    if (!phone) return
    const clean = phone.replace(/\D/g, '')
    window.open(`https://wa.me/${clean}`, '_blank')
  }

  const openHistory = async (item) => {
    setHistoryData(null)
    setHistoryModal(true)
    setHistoryLoading(true)
    try {
      const { data } = await api.get(`/api/contacts/${item.id}/history`)
      setHistoryData(data)
    } catch { toast.error('Erro ao carregar histórico') }
    finally { setHistoryLoading(false) }
  }

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

  const handleImportCSV = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target.result
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) return toast.error('Arquivo inválido ou vazio')
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase())
      const rows = lines.slice(1).map(line => {
        const values = line.match(/(".*?"|[^,]+)/g) || []
        const obj = {}
        headers.forEach((h, i) => { obj[h] = (values[i] || '').replace(/^"|"$/g, '').trim() })
        return obj
      }).filter(r => r.name || r.nome)
      if (rows.length === 0) return toast.error('Nenhum contato encontrado. Verifique se o CSV tem coluna "name" ou "nome"')
      setImporting(true)
      try {
        const { data } = await api.post('/api/contacts/import', { rows })
        if (data.imported > 0) { toast.success(`${data.imported} contatos importados!`); load() }
        if (data.errors?.length > 0) toast.error(`${data.errors.length} erros`)
      } catch (err) {
        toast.error(err.response?.data?.error || 'Erro ao importar')
      } finally { setImporting(false) }
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Agrupar por letra inicial
  const grouped = items.reduce((acc, c) => {
    const letter = c.name[0].toUpperCase()
    if (!acc[letter]) acc[letter] = []
    acc[letter].push(c)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contatos</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{total} contatos</p>
        </div>
        <div className="flex gap-2">
          <label className={`border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-3 py-2 rounded-lg text-sm cursor-pointer ${importing ? 'opacity-60 pointer-events-none' : ''}`}
            title="Importar CSV com colunas: name/nome, phone/telefone, email, type (client/supplier)">
            {importing ? '⏳...' : '📤 CSV'}
            <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} disabled={importing} />
          </label>
          <button onClick={openCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Novo Contato
          </button>
        </div>
      </div>

      {/* Busca + filtro */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone, email ou CPF/CNPJ..."
            className="w-full border dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="border dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todos</option>
          <option value="client">Clientes</option>
          <option value="supplier">Fornecedores</option>
        </select>
      </div>

      {/* Lista */}
      {loading && <div className="text-center py-8 text-gray-400">Carregando...</div>}

      {!loading && items.length === 0 && (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 text-gray-400">
          <p className="text-5xl mb-3">👥</p>
          <p className="font-medium">{search ? 'Nenhum resultado' : 'Nenhum contato cadastrado'}</p>
          <p className="text-sm mt-1">{!search && 'Adicione clientes e fornecedores para começar'}</p>
        </div>
      )}

      {!loading && Object.keys(grouped).sort().map(letter => (
        <div key={letter}>
          <div className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1 mb-2">{letter}</div>
          <div className="space-y-2">
            {grouped[letter].map(item => (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl px-5 py-4 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center shrink-0">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">{item.name[0].toUpperCase()}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white">{item.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${typeColor[item.type]}`}>
                      {typeLabel[item.type]}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {item.phone && <span>📱 {item.phone}</span>}
                    {item.email && <span>✉️ {item.email}</span>}
                    {item.cpf_cnpj && <span>🪪 {item.cpf_cnpj}</span>}
                    {item.city && <span>📍 {item.city}{item.state ? `/${item.state}` : ''}</span>}
                  </div>
                  {item.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.notes}</p>}
                </div>

                {/* Ações */}
                <div className="flex gap-3 shrink-0">
                  {item.phone && (
                    <button onClick={() => handleWhatsApp(item.phone)}
                      className="text-green-500 hover:text-green-700 text-sm" title="Abrir WhatsApp">
                      💬
                    </button>
                  )}
                  <button onClick={() => openHistory(item)} className="text-purple-500 hover:text-purple-700 text-sm" title="Histórico financeiro">📊</button>
                  <button onClick={() => openEdit(item)} className="text-indigo-500 hover:text-indigo-700 text-sm">✏️</button>
                  <button onClick={() => setDeleteConfirm(item)} className="text-red-400 hover:text-red-600 text-sm">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Modal criar/editar */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar Contato' : 'Novo Contato'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
              <input value={form.name} onChange={e => f('name', e.target.value)}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Nome completo ou razão social" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
              <select value={form.type} onChange={e => f('type', e.target.value)}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="client">Cliente</option>
                <option value="supplier">Fornecedor</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CPF / CNPJ</label>
              <MaskedInput mask="cpfCnpj" value={form.cpf_cnpj} onValueChange={v => f('cpf_cnpj', v)}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="000.000.000-00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">WhatsApp / Telefone</label>
              <MaskedInput mask="phone" value={form.phone} onValueChange={v => f('phone', v)}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => f('email', e.target.value)}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="email@exemplo.com" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Endereço</label>
            <input value={form.address} onChange={e => f('address', e.target.value)}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Rua, número, bairro" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CEP</label>
              <MaskedInput mask="cep" value={form.zip_code} onValueChange={v => f('zip_code', v)}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="00000-000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cidade</label>
              <input value={form.city} onChange={e => f('city', e.target.value)}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Cidade" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
              <MaskedInput mask="state" value={form.state} onValueChange={v => f('state', v)}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="SP" maxLength={2} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observações</label>
            <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Informações adicionais..." />
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
        title="Remover contato"
        message={`Deseja remover "${deleteConfirm?.name}"?`}
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
        confirmLabel="Remover"
      />

      {/* Modal histórico financeiro */}
      <Modal open={historyModal} onClose={() => setHistoryModal(false)}
        title={`📊 Histórico — ${historyData?.contact?.name || '...'}`} size="lg">
        {historyLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : historyData && (
          <div className="space-y-5">
            {/* Resumo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 text-center">
                <p className="text-xs text-green-600 font-medium">A Receber</p>
                <p className="text-lg font-bold text-green-700 dark:text-green-400">{fmt(historyData.summary?.total_receivable)}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-center">
                <p className="text-xs text-red-600 font-medium">A Pagar</p>
                <p className="text-lg font-bold text-red-700 dark:text-red-400">{fmt(historyData.summary?.total_payable)}</p>
              </div>
            </div>

            {/* Dívidas */}
            {historyData.debts?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Dívidas ({historyData.debts.length})</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {historyData.debts.map(d => (
                    <div key={d.id} className="flex items-center justify-between text-sm py-2 border-b dark:border-gray-700">
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-200 text-xs">{d.description}</p>
                        <p className="text-xs text-gray-400">{d.type === 'receivable' ? 'A receber' : 'A pagar'} · {d.status}</p>
                      </div>
                      <span className={`font-semibold text-sm ${d.type === 'receivable' ? 'text-green-600' : 'text-red-600'}`}>
                        {fmt(d.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transações */}
            {historyData.transactions?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Transações ({historyData.transactions.length})</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {historyData.transactions.map(t => (
                    <div key={t.id} className="flex items-center justify-between text-sm py-2 border-b dark:border-gray-700">
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-200 text-xs">{t.description}</p>
                        <p className="text-xs text-gray-400">{new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <span className={`font-semibold text-sm ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {t.type === 'income' ? '+' : '-'}{fmt(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {historyData.debts?.length === 0 && historyData.transactions?.length === 0 && (
              <p className="text-center text-gray-400 py-4 text-sm">Nenhum histórico financeiro encontrado para este contato.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
