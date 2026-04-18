import { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import MaskedInput from '../components/MaskedInput'
import api from '../api'

export default function WhatsApp() {
  const [notifyPhone, setNotifyPhone] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [status, setStatus] = useState(null)   // dados do /status
  const [connecting, setConnecting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sendForm, setSendForm] = useState({ number: '', text: '' })
  const [sending, setSending] = useState(false)

  const pollRef = useRef(null)
  const wasConnectedRef = useRef(false)

  useEffect(() => {
    api.get('/api/whatsapp/settings').then(r => {
      if (r.data?.notify_phone) setNotifyPhone(r.data.notify_phone)
    }).catch(() => {})
    checkStatus(true)
    return () => stopPolling()
  }, [])

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get('/api/whatsapp/status')
        setStatus(data)
        const connected = data?.status?.connected || data?.connected
        if (connected) {
          wasConnectedRef.current = true
        } else if (wasConnectedRef.current && !connected) {
          wasConnectedRef.current = false
          stopPolling()
          await handleDeleteInstance(true)
        }
      } catch {}
    }, 5000)
  }, [])

  const checkStatus = async (silent = false) => {
    try {
      const { data } = await api.get('/api/whatsapp/status')
      setStatus(data)
      const connected = data?.status?.connected || data?.connected
      if (connected) {
        wasConnectedRef.current = true
        startPolling()
      }
    } catch (err) {
      if (!silent) toast.error('Erro ao verificar status')
    }
  }

  const handleConnect = async () => {
    setConnecting(true)
    wasConnectedRef.current = false
    try {
      const { data } = await api.post('/api/whatsapp/connect')
      // A resposta do /instance/connect já inclui o qrcode no campo instance
      setStatus(data)
      startPolling()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao conectar')
    } finally {
      setConnecting(false)
    }
  }

  const handleDeleteInstance = async (auto = false) => {
    if (!auto) setDeleting(true)
    stopPolling()
    try {
      await api.delete('/api/whatsapp/instance')
      setStatus(null)
      wasConnectedRef.current = false
      toast.success(auto ? 'Instância desconectada e deletada automaticamente' : 'Instância deletada!')
    } catch (err) {
      if (!auto) toast.error(err.response?.data?.error || 'Erro ao deletar instância')
    } finally {
      if (!auto) setDeleting(false)
    }
  }

  const savePhone = async (e) => {
    e.preventDefault()
    setSavingPhone(true)
    try {
      await api.post('/api/whatsapp/settings', { notify_phone: notifyPhone })
      toast.success('Número salvo!')
    } catch { toast.error('Erro ao salvar') } finally { setSavingPhone(false) }
  }

  const sendMessage = async () => {
    if (!sendForm.number || !sendForm.text) return toast.error('Número e mensagem são obrigatórios')
    setSending(true)
    try {
      await api.post('/api/whatsapp/send', sendForm)
      toast.success('Mensagem enviada!')
      setSendForm({ number: '', text: '' })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar mensagem')
    } finally { setSending(false) }
  }

  // Extrai info do retorno do status ou connect
  const connected = status?.status?.connected || status?.connected || false
  const loggedIn  = status?.status?.loggedIn  || status?.loggedIn  || false
  const qrcode    = status?.instance?.qrcode  || status?.qrcode    || null
  const profileName = status?.instance?.profileName || status?.profileName || null
  const jidUser   = status?.status?.jid?.user || status?.jid?.user || null
  const instStatus = status?.instance?.status || status?.status || null
  const isConnecting = instStatus === 'connecting' || (!connected && qrcode)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">WhatsApp</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Integração via uazapi</p>
      </div>

      {/* Card de conexão */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-5">📱 Instância</h2>

        {/* Status badge */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-5 ${
          connected
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : isConnecting
            ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
            : 'bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600'
        }`}>
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            connected ? 'bg-green-500 animate-pulse' : isConnecting ? 'bg-amber-400 animate-pulse' : 'bg-gray-400'
          }`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${
              connected ? 'text-green-700 dark:text-green-400'
              : isConnecting ? 'text-amber-700 dark:text-amber-400'
              : 'text-gray-500 dark:text-gray-400'
            }`}>
              {connected ? 'Conectado' : isConnecting ? 'Aguardando leitura do QR...' : 'Desconectado'}
            </p>
            {connected && (profileName || jidUser) && (
              <p className="text-xs text-green-600 dark:text-green-500 truncate">
                {profileName}{jidUser ? ` · ${jidUser}` : ''}
              </p>
            )}
          </div>
        </div>

        {/* Botões */}
        <div className="flex flex-wrap gap-3">
          {!connected && (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              {connecting
                ? <><span className="animate-spin inline-block">⏳</span> Conectando...</>
                : <>📲 {isConnecting ? 'Novo QR Code' : 'Conectar WhatsApp'}</>
              }
            </button>
          )}
          {connected && (
            <>
              <button
                onClick={() => checkStatus()}
                className="border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-lg text-sm"
              >
                🔄 Verificar status
              </button>
              <button
                onClick={() => handleDeleteInstance(false)}
                disabled={deleting}
                className="border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60 px-4 py-2.5 rounded-lg text-sm font-medium"
              >
                {deleting ? 'Deletando...' : '🗑️ Deletar instância'}
              </button>
            </>
          )}
        </div>

        {/* QR Code */}
        {qrcode && !connected && (
          <div className="mt-5 flex flex-col items-center gap-3 p-5 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Escaneie com o WhatsApp</p>
            <img
              src={qrcode.startsWith('data:') ? qrcode : `data:image/png;base64,${qrcode}`}
              alt="QR Code WhatsApp"
              className="w-56 h-56 rounded-xl border-4 border-white shadow-md"
            />
            <p className="text-xs text-gray-400 text-center">
              WhatsApp → Dispositivos vinculados → Vincular dispositivo
            </p>
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
              <span className="animate-pulse">⏳</span>
              Verificando a cada 5s... QR expira em 2 minutos
            </div>
          </div>
        )}
      </div>

      {/* Número para resumo semanal */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">🔔 Resumo semanal</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Número que receberá o resumo financeiro toda segunda-feira às 8h</p>
        <form onSubmit={savePhone} className="flex gap-3">
          <MaskedInput
            mask="phoneIntl"
            value={notifyPhone}
            onValueChange={v => setNotifyPhone(v)}
            className="flex-1 border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="+55 (11) 99999-9999"
          />
          <button type="submit" disabled={savingPhone}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {savingPhone ? 'Salvando...' : 'Salvar'}
          </button>
        </form>
      </div>

      {/* Enviar mensagem */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">💬 Enviar Mensagem</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Número (com DDI)</label>
            <MaskedInput
              mask="phoneIntl"
              value={sendForm.number}
              onValueChange={v => setSendForm(p => ({ ...p, number: v }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="+55 (11) 99999-9999"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensagem</label>
            <textarea
              value={sendForm.text}
              onChange={e => setSendForm(p => ({ ...p, text: e.target.value }))}
              rows={4}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Suporta *negrito*, _itálico_"
            />
            <p className="text-xs text-gray-400 mt-1">{sendForm.text.length} caracteres</p>
          </div>
          <button
            onClick={sendMessage}
            disabled={sending || !connected}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-6 py-2 rounded-lg text-sm font-medium"
          >
            {sending ? 'Enviando...' : '📤 Enviar mensagem'}
          </button>
          {!connected && <p className="text-xs text-gray-400">Conecte o WhatsApp para enviar mensagens</p>}
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
        <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-2">ℹ️ Notificações automáticas</h3>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
          <li>Nas <strong>Dívidas</strong>, use o botão "💬 Notificar" para cobrança direta</li>
          <li>No <strong>Painel de Inadimplentes</strong>, use "Cobrar Todos" para notificação em massa</li>
          <li>Na <strong>Agenda</strong>, configure lembretes automáticos via WhatsApp</li>
          <li>Ao desconectar, a instância é <strong>deletada automaticamente</strong></li>
        </ul>
      </div>
    </div>
  )
}
