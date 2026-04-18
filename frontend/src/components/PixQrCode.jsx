import { useState, useEffect } from 'react'
import api from '../api'

export default function PixQrCode({ amount, debtId, description, onClose }) {
  const [qrData, setQrData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/api/auth/me')
        if (data.pix_key) {
          setQrData({
            pix_key: data.pix_key,
            pix_key_type: data.pix_key_type,
            name: data.name
          })
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const copyPixKey = () => {
    if (!qrData?.pix_key) return
    navigator.clipboard.writeText(qrData.pix_key).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

  if (loading) return <div className="text-center py-4"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>

  if (!qrData) return (
    <div className="text-center py-4 text-gray-400 text-sm">
      <p>Chave Pix nao configurada.</p>
      <p className="text-xs mt-1">Configure em Configuracoes &gt; Perfil</p>
    </div>
  )

  return (
    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-5">
      <div className="text-center mb-3">
        <h4 className="font-bold text-green-800 dark:text-green-300 text-lg">Pagamento via Pix</h4>
        {amount > 0 && (
          <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">{fmt(amount)}</p>
        )}
        {description && (
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">{description}</p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          {qrData.pix_key_type ? qrData.pix_key_type.toUpperCase() : 'CHAVE PIX'}
        </p>
        <p className="font-mono text-sm text-gray-800 dark:text-white break-all">{qrData.pix_key}</p>
        <p className="text-xs text-gray-400 mt-1">{qrData.name}</p>

        <button onClick={copyPixKey}
          className={`mt-3 w-full py-2 rounded-lg text-sm font-medium transition-colors ${
            copied
              ? 'bg-green-600 text-white'
              : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/60'
          }`}>
          {copied ? 'Copiado!' : 'Copiar Chave Pix'}
        </button>
      </div>

      {onClose && (
        <button onClick={onClose}
          className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          Fechar
        </button>
      )}
    </div>
  )
}
