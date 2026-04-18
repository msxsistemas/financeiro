export default function EmptyState({ message = 'Nenhum item encontrado', icon }) {
  return (
    <div className="text-center py-12 text-gray-400 dark:text-gray-500">
      {icon && <div className="text-4xl mb-2">{icon}</div>}
      <p>{message}</p>
    </div>
  )
}
