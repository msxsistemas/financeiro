import { useState } from 'react'
import api from '../api'

const steps = [
  {
    id: 'welcome',
    icon: '💎',
    title: 'Bem-vindo ao Financeiro MSX!',
    desc: 'Seu sistema financeiro completo. Vamos configurar tudo rapidamente.',
    fields: null
  },
  {
    id: 'done',
    icon: '🎉',
    title: 'Tudo pronto!',
    desc: 'Sua conta está configurada. Explore todas as funcionalidades.',
    fields: null
  }
]

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const current = steps[step]

  const handleNext = async () => {
    if (current.id === 'done') {
      await finishOnboarding()
      return
    }
    setStep(s => s + 1)
  }

  const finishOnboarding = async () => {
    try {
      await api.put('/api/auth/onboarding', { completed: true }).catch(() => {})
    } catch {}
    onComplete()
  }

  const progress = ((step) / (steps.length - 1)) * 100

  return (
    <div className="fixed inset-0 bg-gray-900/95 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>Configuração inicial</span>
            <span>{step + 1} / {steps.length}</span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
            <div
              className="h-2 bg-indigo-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">{current.icon}</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{current.title}</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{current.desc}</p>
        </div>

        {/* Done step features list */}
        {current.id === 'done' && (
          <div className="grid grid-cols-2 gap-2 mb-8 text-sm">
            {['💰 Transações', '📋 Dívidas', '🤝 Empréstimos', '📦 Produtos', '🛒 PDV', '📈 Relatórios', '📅 Agenda', '💬 WhatsApp'].map(f => (
              <div key={f} className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <span className="text-green-500">✓</span> {f}
              </div>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleNext}
            disabled={saving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold"
          >
            {saving ? 'Salvando...' : current.id === 'done' ? 'Começar!' : 'Próximo →'}
          </button>
        </div>

        {step === 0 && (
          <button onClick={finishOnboarding} className="mt-4 w-full text-center text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            Pular configuração inicial
          </button>
        )}
      </div>
    </div>
  )
}
