export default function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel = 'Confirmar', confirmClass = 'bg-red-600 hover:bg-red-700' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-6">
        <div className="text-center mb-4">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">⚠️</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          {message && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{message}</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 font-medium">
            Cancelar
          </button>
          <button onClick={onConfirm} className={`flex-1 text-white py-2 rounded-lg text-sm font-medium ${confirmClass}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
