export default function NumberStepper({ value, onChange, min = 0, max = 9999, step = 1, className = '', disabled = false, ...rest }) {
  const n = parseInt(value)
  const current = isFinite(n) ? n : 0

  const clamp = (v) => Math.max(min, Math.min(max, v))
  const set = (v) => onChange(String(clamp(v)))
  const dec = () => set(current - step)
  const inc = () => set(current + step)

  return (
    <div className={`inline-flex items-stretch rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-700 ${className}`}>
      <button type="button" onClick={dec} disabled={disabled || current <= min}
        className="px-3 text-lg font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">−</button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={e => {
          const d = e.target.value.replace(/\D/g, '')
          if (d === '') return onChange('')
          set(parseInt(d, 10))
        }}
        disabled={disabled}
        className="w-16 text-center border-x border-gray-300 dark:border-gray-600 bg-transparent text-sm dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
        {...rest}
      />
      <button type="button" onClick={inc} disabled={disabled || current >= max}
        className="px-3 text-lg font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">+</button>
    </div>
  )
}
