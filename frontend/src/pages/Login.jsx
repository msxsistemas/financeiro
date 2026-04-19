import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api'

export default function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [forgotOpen, setForgotOpen] = useState(false)
  const formRef = useRef(null)

  // Anti-autofill: após montar, garante que os campos estão vazios
  // (Chrome pode auto-preencher mesmo com value="" controlado)
  useEffect(() => {
    const t = setTimeout(() => {
      const inputs = formRef.current?.querySelectorAll('input')
      inputs?.forEach(i => {
        if (i.value && !form.email && !form.password) {
          i.value = ''
        }
      })
    }, 100)
    return () => clearTimeout(t)
  }, [])
  const [totpCode, setTotpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [requires2fa, setRequires2fa] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = { ...form }
      if (requires2fa) payload.totp_code = totpCode

      const { data } = await api.post('/api/auth/login', payload)

      if (data.requires_2fa) {
        setRequires2fa(true)
        toast('Digite o código do seu autenticador', { icon: '🔐' })
        return
      }

      // Limpa flags de onboarding/cache do usuário anterior
      const prevUser = JSON.parse(localStorage.getItem('fin_user') || '{}')
      if (prevUser.id !== data.user?.id) {
        localStorage.removeItem('fin_onboarding_done')
      }

      localStorage.setItem('fin_token', data.token)
      localStorage.setItem('fin_user', JSON.stringify(data.user))
      if (data.refresh_token) localStorage.setItem('fin_refresh_token', data.refresh_token)
      if (data.user?.must_change_password) {
        toast('Por segurança, troque a senha padrão agora', { icon: '🔐', duration: 5000 })
        navigate('/settings?forcePassword=1')
      } else {
        navigate('/')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-900 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <span className="text-5xl">💎</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Financeiro MSX</h1>
          <p className="text-gray-500 text-sm mt-1">Gestão financeira inteligente</p>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          {!requires2fa ? (
            <>
              {/* honeypot para enganar o autofill do Chrome */}
              <input type="text" name="fake_username" style={{ display: 'none' }} autoComplete="username" readOnly tabIndex={-1} />
              <input type="password" name="fake_password" style={{ display: 'none' }} autoComplete="current-password" readOnly tabIndex={-1} />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="fin_login_email"
                  required
                  autoComplete="off"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="seu@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input
                  type="password"
                  name="fin_login_pw"
                  required
                  autoComplete="new-password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
            </>
          ) : (
            <div>
              <div className="text-center mb-4 p-4 bg-indigo-50 rounded-xl">
                <span className="text-3xl">🔐</span>
                <p className="text-sm font-medium text-indigo-700 mt-2">Autenticação de dois fatores</p>
                <p className="text-xs text-indigo-500 mt-1">Abra seu app autenticador e digite o código de 6 dígitos</p>
              </div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código 2FA</label>
              <input
                type="text"
                required
                maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center text-2xl tracking-[0.5em] font-mono"
                placeholder="000000"
                autoFocus
              />
              <button
                type="button"
                onClick={() => { setRequires2fa(false); setTotpCode('') }}
                className="flex items-center justify-center gap-2 w-full mt-3 border-2 border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 font-medium py-2.5 rounded-lg transition-all text-sm"
              >
                ← Voltar ao login
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (requires2fa && totpCode.length !== 6)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Verificando...' : requires2fa ? 'Confirmar' : 'Entrar'}
          </button>
        </form>

        {!requires2fa && (
          <>
            <button type="button" onClick={() => setForgotOpen(true)}
              className="w-full mt-3 text-sm text-indigo-600 hover:text-indigo-800 hover:underline">
              Esqueceu a senha?
            </button>
            <p className="text-center text-xs text-gray-400 mt-6">
              Login padrão: admin@financeiro.com / admin123
            </p>
          </>
        )}
      </div>

      {/* Modal: Esqueci a senha */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setForgotOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg text-gray-800 dark:text-white">🔑 Esqueci minha senha</h2>
              <button onClick={() => setForgotOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <p>Para recuperar seu acesso, entre em contato com um administrador do sistema. Ele poderá:</p>
              <ul className="list-disc list-inside pl-2 space-y-1">
                <li>Resetar sua senha no painel admin</li>
                <li>Gerar uma senha provisória</li>
                <li>Você será forçado a trocar no próximo login</li>
              </ul>
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 mt-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Contato do administrador:</p>
                <p className="font-mono text-indigo-700 dark:text-indigo-300">admin@financeiro.msxsystem.site</p>
              </div>
              <button onClick={() => setForgotOpen(false)}
                className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium">
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
