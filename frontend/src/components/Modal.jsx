import { useEffect } from 'react'

export default function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const sizes = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative bg-white dark:bg-gray-800 shadow-2xl w-full h-[92vh] sm:h-auto sm:max-h-[90vh] rounded-t-xl sm:rounded-xl flex flex-col ${sizes[size]}`}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b dark:border-gray-700 pt-[max(env(safe-area-inset-top),1rem)] sm:pt-4">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white truncate pr-4">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-3xl leading-none w-10 h-10 flex items-center justify-center -mr-2"
          >&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {children}
        </div>
      </div>
    </div>
  )
}
