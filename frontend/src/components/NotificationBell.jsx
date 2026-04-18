import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const typeColor = {
  danger: 'bg-red-50 border-l-4 border-red-500',
  warning: 'bg-yellow-50 border-l-4 border-yellow-500',
  info: 'bg-blue-50 border-l-4 border-blue-500'
}
const typeIcon = { danger: '🔴', warning: '🟡', info: '🔵' }

export default function NotificationBell() {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const { data: d } = await api.get('/api/notifications')
      setData(d)
    } catch {}
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000) // recarrega a cada 1 min
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const count = data?.total || 0
  const hasDanger = data?.has_danger

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-gray-800 transition-colors"
        title="Notificações"
      >
        <span className="text-xl">🔔</span>
        {count > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center ${hasDanger ? 'bg-red-500' : 'bg-yellow-500'}`}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-gray-800 text-sm">Notificações</span>
            <span className="text-xs text-gray-400">{count} alerta{count !== 1 ? 's' : ''}</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {(!data?.alerts || data.alerts.length === 0) && (
              <div className="text-center py-8 text-gray-400 text-sm">
                <p className="text-2xl mb-2">✅</p>
                <p>Nenhum alerta no momento</p>
              </div>
            )}
            {data?.alerts?.map(alert => (
              <button
                key={alert.id}
                onClick={() => { setOpen(false); navigate(alert.action_url || '/') }}
                className={`w-full text-left px-4 py-3 border-b last:border-0 hover:opacity-80 transition-opacity ${typeColor[alert.type]}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-0.5">{typeIcon[alert.type]}</span>
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{alert.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{alert.message}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {count > 0 && (
            <div className="px-4 py-2 bg-gray-50 border-t">
              <button onClick={() => { setOpen(false); load() }} className="text-xs text-indigo-600 hover:text-indigo-800">
                🔄 Atualizar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
