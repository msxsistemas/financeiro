import { Outlet, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'

export default function Layout() {
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable
      if (isInput) return

      if (e.key === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        navigate('/')
        return
      }
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        navigate('/contacts')
        return
      }
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        navigate('/reports')
        return
      }
      if (e.key === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        navigate('/debts')
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-gray-100 dark:bg-gray-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Spacer para o botão hamburger no mobile: respeita o notch */}
        <div
          className="lg:hidden"
          style={{ height: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }}
        />
        <div className="px-3 sm:px-4 lg:px-6 pb-safe py-3 lg:py-6">
          <Outlet />
        </div>
      </main>
      <CommandPalette />
    </div>
  )
}
