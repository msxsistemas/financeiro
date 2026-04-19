import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

const COMMANDS = [
  { label: 'Dashboard', path: '/', icon: '📊', keywords: 'dashboard inicio home' },
  { label: 'Dívidas · A Pagar', path: '/debts/payable', icon: '📋', keywords: 'divida pagar' },
  { label: 'Dívidas · A Receber', path: '/debts/receivable', icon: '📋', keywords: 'divida receber' },
  { label: 'Despesas', path: '/expenses', icon: '💸', keywords: 'despesas gastos' },
  { label: 'Produtos', path: '/products', icon: '📦', keywords: 'produtos estoque' },
  { label: 'Categorias', path: '/categories', icon: '🏷️', keywords: 'categorias' },
  { label: 'Relatórios', path: '/reports', icon: '📈', keywords: 'relatorios reports' },
  { label: 'Agenda', path: '/calendar', icon: '📅', keywords: 'agenda calendario agendamentos' },
  { label: 'WhatsApp', path: '/whatsapp', icon: '💬', keywords: 'whatsapp' },
  { label: 'Contatos', path: '/contacts', icon: '👥', keywords: 'contatos clientes' },
  { label: 'Metas', path: '/goals', icon: '🎯', keywords: 'metas' },
  { label: 'Empréstimos', path: '/loans', icon: '🤝', keywords: 'emprestimos agiotagem' },
  { label: 'Inadimplentes', path: '/delinquents', icon: '⚠️', keywords: 'inadimplentes devedores' },
  { label: 'IPTV · Servidores', path: '/iptv/servers', icon: '📺', keywords: 'iptv servidor' },
  { label: 'IPTV · Revendas', path: '/iptv/resellers', icon: '📺', keywords: 'iptv revendas' },
  { label: 'IPTV · Meus Clientes', path: '/iptv/my-clients', icon: '📺', keywords: 'iptv clientes' },
  { label: 'IPTV · Dívidas', path: '/iptv/debts', icon: '📺', keywords: 'iptv divida' },
  { label: 'IPTV · Despesas', path: '/iptv/expenses', icon: '📺', keywords: 'iptv despesa' },
  { label: 'Log WhatsApp', path: '/whatsapp-log', icon: '📩', keywords: 'log mensagens' },
  { label: 'Configurações', path: '/settings', icon: '⚙️', keywords: 'configuracoes settings' }
]

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return COMMANDS
    return COMMANDS.filter(c =>
      c.label.toLowerCase().includes(qq) || c.keywords.toLowerCase().includes(qq)
    )
  }, [q])

  const go = (item) => {
    navigate(item.path)
    setOpen(false)
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[idx]) go(filtered[idx]) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[600px] max-w-[92vw] overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setIdx(0) }}
          onKeyDown={onKey}
          placeholder="Ir para…  (Esc fecha, ↑↓ navega)"
          className="w-full px-5 py-4 text-base bg-transparent border-b border-gray-100 dark:border-gray-700 focus:outline-none dark:text-white"
        />
        <div className="max-h-[50vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">Nada encontrado</p>
          ) : (
            filtered.map((c, i) => (
              <button key={c.path}
                onClick={() => go(c)}
                onMouseEnter={() => setIdx(i)}
                className={`w-full flex items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors ${
                  i === idx
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}>
                <span className="text-lg">{c.icon}</span>
                <span className="flex-1 truncate">{c.label}</span>
                {i === idx && <span className="text-xs text-gray-400">↵</span>}
              </button>
            ))
          )}
        </div>
        <div className="px-5 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
          <kbd className="font-mono">Ctrl/⌘+K</kbd> para abrir · <kbd className="font-mono">Esc</kbd> fecha
        </div>
      </div>
    </div>
  )
}
