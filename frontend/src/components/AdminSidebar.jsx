import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import Icon from './Icon'

const adminNav = [
  { path: '/admin', icon: 'dashboard', label: 'Visão geral', exact: true },
  { path: '/admin/users', icon: 'contacts', label: 'Usuários' },
  { path: '/admin/activity', icon: 'clock', label: 'Logs do sistema' }
]

export default function AdminSidebar() {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const user = (() => { try { return JSON.parse(localStorage.getItem('fin_user') || '{}') } catch { return {} } })()

  const handleLogout = () => {
    localStorage.removeItem('fin_token')
    localStorage.removeItem('fin_user')
    navigate('/login')
  }

  const NavContent = ({ onNavClick }) => (
    <>
      {adminNav.map(item => (
        <NavLink key={item.path} to={item.path} end={item.exact} onClick={onNavClick}
          className={({ isActive }) => `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
            isActive
              ? 'bg-red-600 text-white'
              : 'text-red-100 hover:bg-red-900/60 hover:text-white'
          }`}>
          <Icon name={item.icon} size={20} className="shrink-0" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </>
  )

  return (
    <>
      {/* Mobile burger */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu admin"
        className="lg:hidden fixed left-3 z-40 bg-red-900 text-white w-11 h-11 rounded-lg shadow-lg flex items-center justify-center"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        <Icon name="menu" size={20} />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-red-950 text-white flex flex-col h-full shadow-2xl pt-safe pb-safe">
            <div className="flex items-center justify-between px-4 py-5 border-b border-red-900">
              <div className="flex items-center gap-2">
                <Icon name="shield" size={22} className="text-red-300" />
                <span className="font-bold text-white">Admin · MSX</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-red-300 hover:text-white">
                <Icon name="close" size={20} />
              </button>
            </div>
            <nav className="flex-1 py-4 overflow-y-auto">
              <NavContent onNavClick={() => setMobileOpen(false)} />
            </nav>
            <div className="border-t border-red-900 p-4">
              <button onClick={handleLogout}
                className="flex items-center gap-3 text-red-200 hover:text-white text-sm w-full">
                <Icon name="logout" size={18} />
                <span>Sair</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop */}
      <aside className="hidden lg:flex w-60 bg-red-950 text-white flex-col h-[100dvh] shrink-0">
        <div className="px-4 py-5 border-b border-red-900">
          <div className="flex items-center gap-2">
            <Icon name="shield" size={22} className="text-red-300" />
            <span className="font-bold text-white">Admin · MSX</span>
          </div>
          <p className="text-xs text-red-300/80 mt-1">{user.email}</p>
        </div>
        <nav className="flex-1 py-4 overflow-y-auto">
          <NavContent />
        </nav>
        <div className="border-t border-red-900 p-4">
          <button onClick={handleLogout}
            className="flex items-center gap-3 text-red-200 hover:text-white text-sm w-full">
            <Icon name="logout" size={18} />
            <span>Sair</span>
          </button>
        </div>
      </aside>
    </>
  )
}
