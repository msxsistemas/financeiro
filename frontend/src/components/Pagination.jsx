export default function Pagination({ page, pages, onPageChange }) {
  if (pages <= 1) return null

  return (
    <div className="flex justify-center gap-2 mt-6">
      {Array.from({ length: pages }, (_, i) => (
        <button
          key={i}
          onClick={() => onPageChange(i + 1)}
          className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
            page === i + 1
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {i + 1}
        </button>
      ))}
    </div>
  )
}
