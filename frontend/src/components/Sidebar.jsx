import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import Icon from './Icon'

const navItems = [
  { path: '/', icon: 'dashboard', label: 'Dashboard', exact: true },
  {
    path: '/debts', icon: 'debts', label: 'Dívidas',
    children: [
      { path: '/debts/payable', label: 'A Pagar' },
      { path: '/debts/receivable', label: 'A Receber' },
    ]
  },
  {
    path: '/iptv', icon: 'iptv', label: 'IPTV',
    children: [
      { path: '/iptv/servers', label: 'Servidores & Apps' },
      { path: '/iptv/resellers', label: 'Revendas' },
      { path: '/iptv/my-clients', label: 'Meus Clientes' },
      { path: '/iptv/debts', label: 'Dívidas' },
      { path: '/iptv/expenses', label: 'Despesas' },
    ]
  },
  { path: '/expenses', icon: 'expenses', label: 'Despesas' },
  { path: '/products', icon: 'products', label: 'Produtos' },
  { path: '/categories', icon: 'categories', label: 'Categorias' },
  { path: '/reports', icon: 'reports', label: 'Relatórios' },
  { path: '/calendar', icon: 'calendar', label: 'Agenda' },
  { path: '/whatsapp', icon: 'whatsapp', label: 'WhatsApp' },
  { path: '/contacts', icon: 'contacts', label: 'Contatos' },
  { path: '/goals', icon: 'goals', label: 'Metas' },
  { path: '/loans', icon: 'loans', label: 'Empréstimos' },
  { path: '/delinquents', icon: 'delinquents', label: 'Inadimplentes' },
  { path: '/whatsapp-log', icon: 'inbox', label: 'Log WhatsApp' },
  { path: '/trash', icon: 'trash', label: 'Lixeira' },
  { path: '/admin', icon: 'shield', label: 'Admin', adminOnly: true },
  { path: '/settings', icon: 'settings', label: 'Configurações' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { dark, toggleDark } = useTheme()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('fin_sidebar_collapsed') === 'true')
  const [mobileOpen, setMobileOpen] = useState(false)

  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('fin_user') || '{}') } catch { return {} } })()
  const visibleNav = navItems.filter(item => !item.adminOnly || currentUser.role === 'admin')

  const [openMenus, setOpenMenus] = useState(() => {
    const open = {}
    visibleNav.forEach(item => {
      if (item.children && location.pathname === item.path) open[item.path] = true
    })
    return open
  })

  const toggleMenu = (path) => {
    setOpenMenus(prev => ({ ...prev, [path]: !prev[path] }))
  }

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('fin_sidebar_collapsed', String(next))
  }
  const user = (() => { try { return JSON.parse(localStorage.getItem('fin_user') || '{}') } catch { return {} } })()

  const handleLogout = () => {
    localStorage.removeItem('fin_token')
    localStorage.removeItem('fin_user')
    navigate('/login')
  }

  const NavContent = ({ onNavClick }) => (
    <>
      {visibleNav.map(item => {
        const isActive = item.exact
          ? location.pathname === item.path
          : location.pathname === item.path || location.pathname.startsWith(item.path + '/')
        const isOpen = openMenus[item.path] || (item.children && isActive)

        if (item.children) {
          return (
            <div key={item.path}>
              <button
                onClick={() => {
                  if (collapsed) {
                    navigate(item.path)
                    onNavClick?.()
                  } else {
                    toggleMenu(item.path)
                  }
                }}
                className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors w-full ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon name={item.icon} size={20} className="shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    <span className={`text-xs transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>&#9662;</span>
                  </>
                )}
              </button>
              {!collapsed && isOpen && (
                <div className="py-1">
                  {item.children.map(child => {
                    const childActive = location.pathname === child.path
                    return (
                      <button
                        key={child.path}
                        onClick={() => { navigate(child.path); onNavClick?.() }}
                        className={`flex items-center gap-3 w-full text-left pl-10 pr-4 py-2.5 text-sm transition-colors ${
                          childActive
                            ? 'text-indigo-400 font-medium'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${childActive ? 'bg-indigo-400' : 'border border-gray-500'}`} />
                        <span>{child.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }

        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.exact}
            onClick={onNavClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <Icon name={item.icon} size={20} className="shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        )
      })}
    </>
  )

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 bg-gray-900 text-white p-2 rounded-lg shadow-lg"
      >
        ☰
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-gray-900 text-white flex flex-col h-full shadow-2xl">
            <div className="flex items-center justify-between px-4 py-5 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-2xl">💎</span>
                <span className="font-bold text-white text-lg">Financeiro</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <nav className="flex-1 py-4 overflow-y-auto">
              <NavContent onNavClick={() => setMobileOpen(false)} />
            </nav>
            <div className="border-t border-gray-700 p-4 space-y-2">
              <button onClick={toggleDark}
                className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors text-sm w-full">
                <Icon name={dark ? 'sun' : 'moon'} size={18} />
                <span>{dark ? 'Modo claro' : 'Modo escuro'}</span>
              </button>
              <button onClick={handleLogout} className="flex items-center gap-3 text-gray-400 hover:text-red-400 transition-colors text-sm w-full">
                <Icon name="logout" size={18} />
                <span>Sair</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex ${collapsed ? 'w-16' : 'w-60'} transition-all duration-300 bg-gray-900 text-white flex-col h-screen shrink-0`}>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-gray-700">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <span className="text-2xl">💎</span>
              <span className="font-bold text-white text-lg">Financeiro</span>
            </div>
          )}
          {collapsed && <span className="text-2xl mx-auto">💎</span>}
          <button onClick={toggleCollapsed} className="text-gray-400 hover:text-white text-sm">
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* Navegação */}
        <nav className="flex-1 py-4 overflow-y-auto scrollbar-thin">
          <NavContent />
        </nav>

        {/* Rodapé: dark mode + logout */}
        <div className="border-t border-gray-700 p-4 space-y-1">
          <button onClick={toggleDark}
            className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors text-sm w-full px-0 py-2">
            <Icon name={dark ? 'sun' : 'moon'} size={18} className="shrink-0" />
            {!collapsed && <span>{dark ? 'Modo claro' : 'Modo escuro'}</span>}
          </button>
          <button onClick={handleLogout} className="flex items-center gap-3 text-gray-400 hover:text-red-400 transition-colors text-sm w-full">
            <Icon name="logout" size={18} className="shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
