import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import ConfirmDialog from '../components/ConfirmDialog'
import api from '../api'
import { formatCurrencyBRL, formatDateTimeBR } from '../utils/masks'

const ENTITY_ICONS = {
  transaction: '💸', debt: '📋', contact: '👥', product: '📦',
  loan: '🤝', calendar_event: '📅', goal: '🎯'
}

export default function Trash() {
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [purgeConfirm, setPurgeConfirm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/trash')
      setData(data || {})
    } catch {
      toast.error('Erro ao carregar lixeira')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const restore = async (entity, id) => {
    try {
      await api.post(`/api/trash/${entity}/${id}/restore`)
      toast.success('Restaurado')
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao restaurar') }
  }

  const purgeOne = async (entity, id) => {
    if (!confirm('Apagar PERMANENTEMENTE? Essa ação não pode ser desfeita.')) return
    try {
      await api.delete(`/api/trash/${entity}/${id}`)
      toast.success('Apagado permanentemente')
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao apagar') }
  }

  const purgeAll = async () => {
    try {
      const { data: res } = await api.delete('/api/trash')
      toast.success(`${res.deleted || 0} item(ns) apagado(s) permanentemente`)
      setPurgeConfirm(false)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao esvaziar') }
  }

  const allItems = Object.entries(data).flatMap(([entity, info]) =>
    (info.items || []).map(item => ({ ...item, __entity: entity, __label: info.label }))
  )
  const totalCount = allItems.length
  const visible = activeTab === 'all'
    ? allItems
    : (data[activeTab]?.items || []).map(i => ({ ...i, __entity: activeTab, __label: data[activeTab].label }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🗑️ Lixeira</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {totalCount} item(ns) · itens com mais de 30 dias são apagados automaticamente
          </p>
        </div>
        {totalCount > 0 && (
          <button onClick={() => setPurgeConfirm(true)}
            className="border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 rounded-lg text-sm font-medium">
            Esvaziar lixeira
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setActiveTab('all')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border ${activeTab === 'all'
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'}`}>
          Tudo ({totalCount})
        </button>
        {Object.entries(data).map(([entity, info]) => (
          (info.items?.length || 0) > 0 && (
            <button key={entity} onClick={() => setActiveTab(entity)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border ${activeTab === entity
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'}`}>
              {ENTITY_ICONS[entity]} {info.label} ({info.items.length})
            </button>
          )
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Carregando...</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
          <p className="text-5xl mb-3">🗑️</p>
          <p>Lixeira vazia</p>
          <p className="text-xs mt-2">Itens removidos aparecem aqui por 30 dias antes de serem apagados permanentemente</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(item => (
            <div key={`${item.__entity}_${item.id}`}
              className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4">
              <span className="text-2xl shrink-0">{ENTITY_ICONS[item.__entity]}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white truncate">{item.title || '(sem título)'}</p>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  <span>{item.__label}</span>
                  {item.amount != null && <span>{formatCurrencyBRL(item.amount)}</span>}
                  {item.quantity != null && <span>Qtd: {item.quantity}</span>}
                  {item.phone && <span>📱 {item.phone}</span>}
                  {item.deleted_at && <span>Removido: {formatDateTimeBR(item.deleted_at)}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => restore(item.__entity, item.id)}
                  className="text-xs bg-green-50 hover:bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-lg font-medium">
                  ↩️ Restaurar
                </button>
                <button onClick={() => purgeOne(item.__entity, item.id)}
                  className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={purgeConfirm}
        title="Esvaziar lixeira"
        message="Remover permanentemente TODOS os itens da lixeira? Essa ação não pode ser desfeita."
        onConfirm={purgeAll}
        onCancel={() => setPurgeConfirm(false)}
        confirmLabel="Sim, apagar tudo"
      />
    </div>
  )
}
