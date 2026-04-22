export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white truncate">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {children && <div className="flex gap-2 flex-wrap sm:justify-end">{children}</div>}
    </div>
  )
}
