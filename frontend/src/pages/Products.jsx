import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'
import NumberStepper from '../components/NumberStepper'
import api from '../api'
import { formatCurrencyBRL, formatDateTimeBR } from '../utils/masks'

const defaultForm = {
  name: '', description: '', sku: '', price: '', cost: '',
  stock_quantity: '0', min_stock: '0', unit: 'un', category: ''
}

const movTypeLabel = { in: 'Entrada', out: 'Saída', adjustment: 'Ajuste' }
const movTypeColor = {
  in: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  out: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  adjustment: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
}

export default function Products() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [categories, setCategories] = useState([])

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const [stockModal, setStockModal] = useState(false)
  const [stockProduct, setStockProduct] = useState(null)
  const [stockForm, setStockForm] = useState({ type: 'in', quantity: '1', reason: '' })

  const [detailModal, setDetailModal] = useState(false)
  const [detail, setDetail] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: 200 })
      if (search) params.set('search', search)
      if (categoryFilter) params.set('category', categoryFilter)
      if (lowStockOnly) params.set('low_stock', 'true')
      const { data } = await api.get(`/api/products?${params}`)
      setItems(data.data || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('Erro ao carregar produtos')
    } finally { setLoading(false) }
  }, [search, categoryFilter, lowStockOnly])

  const loadCategories = useCallback(() => {
    api.get('/api/products/categories/list').then(r => setCategories(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadCategories() }, [loadCategories])

  const openCreate = () => { setEditing(null); setForm(defaultForm); setModal(true) }
  const openEdit = (item) => {
    setEditing(item)
    setForm({
      name: item.name || '',
      description: item.description || '',
      sku: item.sku || '',
      price: item.price != null ? String(item.price) : '',
      cost: item.cost != null ? String(item.cost) : '',
      stock_quantity: String(item.stock_quantity ?? 0),
      min_stock: String(item.min_stock ?? 0),
      unit: item.unit || 'un',
      category: item.category || ''
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Nome é obrigatório')
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        sku: form.sku || null,
        price: parseFloat(form.price) || 0,
        cost: parseFloat(form.cost) || 0,
        stock_quantity: parseInt(form.stock_quantity) || 0,
        min_stock: parseInt(form.min_stock) || 0,
        unit: form.unit || 'un',
        category: form.category || null
      }
      if (editing) await api.put(`/api/products/${editing.id}`, payload)
      else await api.post('/api/products', payload)
      toast.success('Salvo!')
      setModal(false)
      load()
      loadCategories()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/api/products/${deleteConfirm.id}`)
      toast.success('Removido')
      setDeleteConfirm(null)
      load()
    } catch { toast.error('Erro ao remover') }
  }

  const openStock = (product) => {
    setStockProduct(product)
    setStockForm({ type: 'in', quantity: '1', reason: '' })
    setStockModal(true)
  }

  const handleStock = async () => {
    const qty = parseInt(stockForm.quantity)
    if (!isFinite(qty) || qty <= 0) return toast.error('Quantidade inválida')
    try {
      await api.post(`/api/products/${stockProduct.id}/stock`, {
        type: stockForm.type,
        quantity: qty,
        reason: stockForm.reason || null
      })
      toast.success('Movimento registrado')
      setStockModal(false)
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao movimentar estoque')
    }
  }

  const openDetail = async (product) => {
    try {
      const { data } = await api.get(`/api/products/${product.id}`)
      setDetail(data)
      setDetailModal(true)
    } catch { toast.error('Erro ao carregar detalhes') }
  }

  const totalStockValue = items.reduce((s, i) => s + parseFloat(i.cost || 0) * parseInt(i.stock_quantity || 0), 0)
  const lowStockCount = items.filter(i => parseInt(i.stock_quantity || 0) <= parseInt(i.min_stock || 0)).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Produtos</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {total} produtos · Valor em estoque: <strong>{formatCurrencyBRL(totalStockValue)}</strong>
            {lowStockCount > 0 && <span className="text-orange-600 dark:text-orange-400 ml-2">· {lowStockCount} com estoque baixo</span>}
          </p>
        </div>
        <button onClick={openCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Novo Produto
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou SKU..."
          className="flex-1 min-w-[200px] border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todas categorias</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={lowStockOnly} onChange={e => setLowStockOnly(e.target.checked)}
            className="w-4 h-4 rounded text-indigo-600" />
          Só estoque baixo
        </label>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
          <p className="text-4xl mb-2">📦</p>
          <p>Nenhum produto cadastrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const low = parseInt(item.stock_quantity) <= parseInt(item.min_stock || 0)
            const margin = parseFloat(item.price) - parseFloat(item.cost || 0)
            return (
              <div key={item.id}
                className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border ${low ? 'border-orange-300 dark:border-orange-700' : 'border-gray-100 dark:border-gray-700'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openDetail(item)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{item.name}</h3>
                      {item.sku && <span className="text-xs text-gray-400">SKU: {item.sku}</span>}
                      {item.category && (
                        <span className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded">
                          {item.category}
                        </span>
                      )}
                      {low && (
                        <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded">
                          ⚠️ Estoque baixo
                        </span>
                      )}
                      {!item.active && (
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>Preço: <strong className="text-gray-800 dark:text-gray-200">{formatCurrencyBRL(item.price)}</strong></span>
                      <span>Custo: {formatCurrencyBRL(item.cost)}</span>
                      <span className={margin >= 0 ? 'text-green-600' : 'text-red-500'}>
                        Margem: {formatCurrencyBRL(margin)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xl font-bold ${low ? 'text-orange-600' : 'text-gray-800 dark:text-white'}`}>
                      {item.stock_quantity} <span className="text-sm font-normal text-gray-400">{item.unit}</span>
                    </p>
                    <p className="text-xs text-gray-400">mín: {item.min_stock}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 flex-wrap">
                  <button onClick={() => openStock(item)}
                    className="text-xs text-green-600 hover:text-green-800">📦 Movimentar estoque</button>
                  <button onClick={() => openDetail(item)}
                    className="text-xs text-indigo-600 hover:text-indigo-800">👁️ Detalhes</button>
                  <button onClick={() => openEdit(item)} className="text-xs text-gray-500 hover:text-gray-700 ml-auto">✏️ Editar</button>
                  <button onClick={() => setDeleteConfirm(item)} className="text-xs text-red-500 hover:text-red-700">🗑️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal criar/editar */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar Produto' : 'Novo Produto'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Nome do produto" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SKU / Código</label>
              <input value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Ex: ABC-123" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoria</label>
              <input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                list="product-categories"
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Ex: Bebidas, Eletrônicos" />
              <datalist id="product-categories">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Custo (R$)</label>
              <MaskedInput mask="currency" value={form.cost} onValueChange={v => setForm(p => ({ ...p, cost: v }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0,00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preço Venda (R$) *</label>
              <MaskedInput mask="currency" value={form.price} onValueChange={v => setForm(p => ({ ...p, price: v }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0,00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidade</label>
              <select value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="un">un (unidade)</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="l">L</option>
                <option value="ml">ml</option>
                <option value="m">m</option>
                <option value="cx">caixa</option>
                <option value="pct">pacote</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {editing ? 'Estoque atual (use "Movimentar" p/ alterar)' : 'Estoque inicial'}
              </label>
              <NumberStepper value={form.stock_quantity} min={0} max={999999}
                onChange={v => setForm(p => ({ ...p, stock_quantity: v }))}
                disabled={!!editing} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estoque mínimo (alerta)</label>
              <NumberStepper value={form.min_stock} min={0} max={9999}
                onChange={v => setForm(p => ({ ...p, min_stock: v }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} placeholder="Detalhes do produto..."
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)}
              className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium">
              {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal movimentar estoque */}
      <Modal open={stockModal} onClose={() => setStockModal(false)} title={`📦 ${stockProduct?.name || ''}`} size="sm">
        {stockProduct && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Estoque atual</span>
                <span className="font-bold text-gray-800 dark:text-white">
                  {stockProduct.stock_quantity} {stockProduct.unit}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['in', '+ Entrada', 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'],
                ['out', '− Saída', 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'],
                ['adjustment', '⚙ Ajuste', 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400']
              ].map(([v, l, active]) => (
                <button key={v} onClick={() => setStockForm(p => ({ ...p, type: v }))}
                  className={`py-2 rounded-lg text-sm font-medium border-2 transition-colors ${stockForm.type === v
                    ? active
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  {l}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Quantidade {stockForm.type === 'adjustment' && '(novo valor do estoque)'}
              </label>
              <NumberStepper value={stockForm.quantity} min={1} max={999999}
                onChange={v => setStockForm(p => ({ ...p, quantity: v }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo / referência</label>
              <input value={stockForm.reason} onChange={e => setStockForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="Ex: NF 1234, quebra, contagem..."
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStockModal(false)}
                className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button onClick={handleStock}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium">
                Confirmar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal detalhes */}
      <Modal open={detailModal} onClose={() => setDetailModal(false)} title={detail?.name || 'Produto'}>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Estoque:</span> <strong>{detail.stock_quantity} {detail.unit}</strong></div>
              <div><span className="text-gray-500">Mínimo:</span> <strong>{detail.min_stock}</strong></div>
              <div><span className="text-gray-500">Custo:</span> <strong>{formatCurrencyBRL(detail.cost)}</strong></div>
              <div><span className="text-gray-500">Preço:</span> <strong>{formatCurrencyBRL(detail.price)}</strong></div>
              {detail.sku && <div className="col-span-2"><span className="text-gray-500">SKU:</span> {detail.sku}</div>}
              {detail.category && <div className="col-span-2"><span className="text-gray-500">Categoria:</span> {detail.category}</div>}
            </div>
            {detail.description && (
              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm text-gray-600 dark:text-gray-300">
                {detail.description}
              </div>
            )}
            <div>
              <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Histórico de movimentações</h4>
              {(!detail.movements || detail.movements.length === 0) ? (
                <p className="text-sm text-gray-400">Nenhuma movimentação registrada</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {detail.movements.map(m => (
                    <div key={m.id} className="flex items-center justify-between text-sm py-2 border-b dark:border-gray-700">
                      <div>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${movTypeColor[m.type]}`}>
                          {movTypeLabel[m.type]}
                        </span>
                        {m.reason && <span className="ml-2 text-gray-500 dark:text-gray-400">{m.reason}</span>}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {m.type === 'adjustment' ? '→' : m.type === 'in' ? '+' : '−'} {m.quantity}
                        </div>
                        <div className="text-xs text-gray-400">{formatDateTimeBR(m.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remover produto"
        message={`Remover "${deleteConfirm?.name}"? O histórico de estoque também será apagado.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        confirmLabel="Remover"
      />
    </div>
  )
}
