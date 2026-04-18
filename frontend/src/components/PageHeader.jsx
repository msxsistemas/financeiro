export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {children && <div className="flex gap-2 flex-wrap justify-end">{children}</div>}
    </div>
  )
}
