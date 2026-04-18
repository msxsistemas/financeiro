const PERIODS = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
  { key: 'all', label: 'Todas' }
]

export function periodRange(key) {
  const today = new Date()
  const iso = (d) => d.toISOString().split('T')[0]
  if (key === 'today') {
    const t = iso(today)
    return { start_date: t, end_date: t }
  }
  if (key === 'week') {
    const start = new Date(today)
    start.setDate(today.getDate() - 6)
    return { start_date: iso(start), end_date: iso(today) }
  }
  if (key === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { start_date: iso(start), end_date: iso(end) }
  }
  return {}
}

export default function PeriodFilter({ value, onChange, options = PERIODS }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(p => (
        <button key={p.key} onClick={() => onChange(p.key)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${value === p.key
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-400'}`}>
          {p.label}
        </button>
      ))}
    </div>
  )
}
