import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import MaskedInput from '../components/MaskedInput'
import { usePushNotifications } from '../hooks/usePushNotifications'
import api from '../api'

export default function Settings() {
  const push = usePushNotifications()
  const [searchParams] = useSearchParams()
  const forcePassword = searchParams.get('forcePassword') === '1'
  const pwRef = useRef(null)
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('fin_user') || '{}') } catch { return {} } })
  const [profile, setProfile] = useState(null)
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)

  useEffect(() => {
    if (forcePassword && pwRef.current) {
      pwRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [forcePassword])

  // Perfil editavel
  const [profileForm, setProfileForm] = useState({ name: '', email: '' })
  const [profileLoading, setProfileLoading] = useState(false)

  // PIX
  const [pixForm, setPixForm] = useState({ pix_key: '', pix_key_type: 'cpf' })
  const [pixLoading, setPixLoading] = useState(false)

  // 2FA
  const [tfaSetup, setTfaSetup] = useState(null)
  const [tfaCode, setTfaCode] = useState('')
  const [tfaModal, setTfaModal] = useState(false)
  const [tfaDisableCode, setTfaDisableCode] = useState('')
  const [tfaDisableModal, setTfaDisableModal] = useState(false)
  const [tfaLoading, setTfaLoading] = useState(false)

  const loadProfile = async () => {
    try {
      const { data } = await api.get('/api/auth/me')
      setProfile(data)
      setProfileForm({ name: data.name || '', email: data.email || '' })
      setPixForm({ pix_key: data.pix_key || '', pix_key_type: data.pix_key_type || 'cpf' })
    } catch {}
  }

  useEffect(() => { loadProfile() }, [])

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    if (!profileForm.name) return toast.error('Nome e obrigatorio')
    if (!profileForm.email) return toast.error('Email e obrigatorio')
    setProfileLoading(true)
    try {
      await api.put('/api/auth/profile', { name: profileForm.name, email: profileForm.email })
      const updatedUser = { ...user, name: profileForm.name, email: profileForm.email }
      localStorage.setItem('fin_user', JSON.stringify(updatedUser))
      setUser(updatedUser)
      toast.success('Perfil atualizado!')
      loadProfile()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar perfil')
    } finally { setProfileLoading(false) }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (pwForm.new_password !== pwForm.confirm) return toast.error('As senhas não coincidem')
    if (pwForm.new_password.length < 6) return toast.error('Senha deve ter no mínimo 6 caracteres')
    setPwLoading(true)
    try {
      await api.put('/api/auth/password', {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password
      })
      toast.success('Senha alterada com sucesso!')
      setPwForm({ current_password: '', new_password: '', confirm: '' })
      // Limpa a flag no user cached — libera onboarding/navegação normal
      const u = JSON.parse(localStorage.getItem('fin_user') || '{}')
      localStorage.setItem('fin_user', JSON.stringify({ ...u, must_change_password: false }))
      if (forcePassword) {
        // Já pode ir para o dashboard
        window.location.href = '/'
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar senha')
    } finally { setPwLoading(false) }
  }

  const handleSavePix = async (e) => {
    e.preventDefault()
    setPixLoading(true)
    try {
      await api.put('/api/auth/profile', pixForm)
      toast.success('Chave PIX salva!')
      loadProfile()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar PIX')
    } finally { setPixLoading(false) }
  }

  const handle2faSetup = async () => {
    setTfaLoading(true)
    try {
      const { data } = await api.get('/api/auth/2fa/setup')
      setTfaSetup(data)
      setTfaModal(true)
    } catch (err) {
      toast.error('Erro ao gerar QR Code')
    } finally { setTfaLoading(false) }
  }

  const handle2faEnable = async () => {
    if (tfaCode.length !== 6) return toast.error('Digite o código de 6 dígitos')
    setTfaLoading(true)
    try {
      await api.post('/api/auth/2fa/enable', { code: tfaCode })
      toast.success('2FA ativado com sucesso!')
      setTfaModal(false)
      setTfaCode('')
      loadProfile()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Código inválido')
    } finally { setTfaLoading(false) }
  }

  const handle2faDisable = async () => {
    if (tfaDisableCode.length !== 6) return toast.error('Digite o código de 6 dígitos')
    setTfaLoading(true)
    try {
      await api.post('/api/auth/2fa/disable', { code: tfaDisableCode })
      toast.success('2FA desativado!')
      setTfaDisableModal(false)
      setTfaDisableCode('')
      loadProfile()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Código inválido')
    } finally { setTfaLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configurações</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Gerencie sua conta e preferências</p>
      </div>

      {/* Perfil */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">👤 Perfil</h2>
        <form onSubmit={handleSaveProfile} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
            <input value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Seu nome" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input type="email" value={profileForm.email} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="seu@email.com" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Perfil</label>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-lg capitalize">{user.role}</p>
          </div>
          <button type="submit" disabled={profileLoading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium">
            {profileLoading ? 'Salvando...' : 'Salvar Perfil'}
          </button>
        </form>
      </div>

      {/* Chave PIX */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">💠 Chave PIX</h2>
        <p className="text-xs text-gray-500 mb-4">Sua chave PIX aparece nos PDFs de cobrança gerados pelo sistema.</p>
        <form onSubmit={handleSavePix} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
              <select value={pixForm.pix_key_type} onChange={e => setPixForm(p => ({ ...p, pix_key_type: e.target.value }))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">Email</option>
                <option value="phone">Telefone</option>
                <option value="random">Aleatória</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chave</label>
              {pixForm.pix_key_type === 'cpf' ? (
                <MaskedInput mask="cpf" value={pixForm.pix_key} onValueChange={v => setPixForm(p => ({ ...p, pix_key: v }))}
                  className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="000.000.000-00" />
              ) : pixForm.pix_key_type === 'cnpj' ? (
                <MaskedInput mask="cnpj" value={pixForm.pix_key} onValueChange={v => setPixForm(p => ({ ...p, pix_key: v }))}
                  className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="00.000.000/0000-00" />
              ) : pixForm.pix_key_type === 'phone' ? (
                <MaskedInput mask="phoneIntl" value={pixForm.pix_key} onValueChange={v => setPixForm(p => ({ ...p, pix_key: v }))}
                  className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="+55 (11) 99999-9999" />
              ) : (
                <input value={pixForm.pix_key} onChange={e => setPixForm(p => ({ ...p, pix_key: e.target.value }))}
                  className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Sua chave PIX..." />
              )}
            </div>
          </div>
          <button type="submit" disabled={pixLoading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium">
            {pixLoading ? 'Salvando...' : 'Salvar PIX'}
          </button>
        </form>
      </div>

      {/* Notificações PWA */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">🔔 Notificações (PWA)</h2>
        <p className="text-xs text-gray-500 mb-4">
          Receba alertas no dispositivo quando uma parcela de empréstimo vencer ou um agendamento estiver próximo (24h e 2h antes).
        </p>
        {!push.supported ? (
          <p className="text-sm text-gray-500">Este navegador não suporta notificações push.</p>
        ) : push.permission === 'denied' ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400">
            As notificações foram bloqueadas. Abra as configurações do navegador para este site e permita notificações.
          </div>
        ) : push.subscribed ? (
          <div className="space-y-3">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 text-sm text-green-700 dark:text-green-400">
              ✅ Notificações ativas neste dispositivo
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={async () => {
                const r = await push.sendTest()
                if (r.sent > 0) toast.success('Notificação de teste enviada!')
                else toast.error(r.error || 'Nenhum dispositivo inscrito')
              }}
                className="text-xs border dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                🧪 Enviar teste
              </button>
              <button onClick={async () => {
                await push.unsubscribe()
                toast.success('Notificações desativadas')
              }}
                className="text-xs border border-red-300 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                Desativar
              </button>
            </div>
          </div>
        ) : (
          <button onClick={async () => {
            const r = await push.subscribe()
            if (r.ok) toast.success('Notificações ativadas!')
            else if (r.reason === 'permission_denied') toast.error('Permissão negada')
            else if (r.reason === 'vapid_not_configured') toast.error('Servidor sem VAPID configurado')
            else toast.error('Erro ao ativar notificações')
          }} disabled={push.loading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {push.loading ? 'Aguarde…' : '🔔 Ativar notificações neste dispositivo'}
          </button>
        )}
      </div>

      {/* 2FA */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">🔐 Autenticação em Dois Fatores (2FA)</h2>
        <p className="text-xs text-gray-500 mb-4">Adicione uma camada extra de segurança usando um app como Google Authenticator ou Authy.</p>

        {profile?.totp_enabled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 px-4 py-3 rounded-xl">
              <span className="text-lg">✅</span>
              <span>2FA está <strong>ativado</strong> na sua conta</span>
            </div>
            <button onClick={() => setTfaDisableModal(true)}
              className="border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium">
              Desativar 2FA
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 dark:bg-gray-700 px-4 py-3 rounded-xl">
              <span className="text-lg">⚠️</span>
              <span>2FA está <strong>desativado</strong>. Recomendamos ativar.</span>
            </div>
            <button onClick={handle2faSetup} disabled={tfaLoading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {tfaLoading ? 'Gerando QR...' : 'Ativar 2FA'}
            </button>
          </div>
        )}
      </div>

      {/* Alterar senha */}
      <div ref={pwRef}
        className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border ${forcePassword ? 'border-red-400 dark:border-red-700 ring-2 ring-red-300' : 'border-gray-100 dark:border-gray-700'}`}>
        {forcePassword && (
          <div className="mb-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm rounded-lg px-3 py-2">
            ⚠️ Por segurança, troque a senha padrão antes de continuar.
          </div>
        )}
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">🔑 Alterar Senha</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Senha atual</label>
            <input type="password" value={pwForm.current_password}
              onChange={e => setPwForm(p => ({ ...p, current_password: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="••••••••" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nova senha</label>
            <input type="password" value={pwForm.new_password}
              onChange={e => setPwForm(p => ({ ...p, new_password: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Mínimo 6 caracteres" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmar nova senha</label>
            <input type="password" value={pwForm.confirm}
              onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
              className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Repita a nova senha" />
          </div>
          <button type="submit" disabled={pwLoading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium">
            {pwLoading ? 'Salvando...' : 'Alterar senha'}
          </button>
        </form>
      </div>

      {/* Info do sistema */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 text-sm">ℹ️ Sistema</h2>
        <div className="space-y-1 text-xs text-gray-500">
          <p>Versão: 1.2.0</p>
          <p>Frontend: financeiro.msxsystem.site</p>
          <p>API: apifinanceiro.msxsystem.site</p>
          <p>Banco: PostgreSQL (Docker isolado)</p>
        </div>
      </div>

      {/* Modal 2FA Setup */}
      <Modal open={tfaModal} onClose={() => setTfaModal(false)} title="Ativar Autenticação 2FA" size="sm">
        {tfaSetup && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              1. Baixe o <strong>Google Authenticator</strong> ou <strong>Authy</strong> no seu celular.<br />
              2. Escaneie o QR Code abaixo:
            </p>
            <div className="flex justify-center">
              <img src={tfaSetup.qr_code} alt="QR Code 2FA" className="w-48 h-48 border-4 border-indigo-100 rounded-xl" />
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Ou digite a chave manualmente:</p>
              <p className="font-mono text-sm font-bold text-gray-800 dark:text-white tracking-widest break-all">{tfaSetup.secret}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Digite o código do app para confirmar</label>
              <input
                type="text"
                maxLength={6}
                value={tfaCode}
                onChange={e => setTfaCode(e.target.value.replace(/\D/g, ''))}
                className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-3 text-center text-xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="000000"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setTfaModal(false)} className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button onClick={handle2faEnable} disabled={tfaLoading || tfaCode.length !== 6}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium">
                {tfaLoading ? 'Ativando...' : 'Ativar 2FA'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal desativar 2FA */}
      <Modal open={tfaDisableModal} onClose={() => setTfaDisableModal(false)} title="Desativar 2FA" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">Digite o código do seu app autenticador para confirmar a desativação.</p>
          <input
            type="text"
            maxLength={6}
            value={tfaDisableCode}
            onChange={e => setTfaDisableCode(e.target.value.replace(/\D/g, ''))}
            className="w-full border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-3 text-center text-xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="000000"
          />
          <div className="flex gap-3">
            <button onClick={() => setTfaDisableModal(false)} className="flex-1 border dark:border-gray-600 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button onClick={handle2faDisable} disabled={tfaLoading || tfaDisableCode.length !== 6}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium">
              {tfaLoading ? 'Desativando...' : 'Desativar'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
