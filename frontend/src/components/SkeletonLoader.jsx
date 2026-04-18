export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 bg-gray-200 rounded w-24" />
        <div className="w-8 h-8 bg-gray-200 rounded-full" />
      </div>
      <div className="h-7 bg-gray-200 rounded w-32 mb-1" />
      <div className="h-2 bg-gray-100 rounded w-20" />
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-gray-50 border-b px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-gray-200 rounded animate-pulse" style={{ width: `${60 + i * 20}px` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-4 border-b last:border-0 animate-pulse">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-3 bg-gray-100 rounded" style={{ width: `${50 + j * 20}px`, opacity: 1 - j * 0.1 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonList({ rows = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 animate-pulse">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
              <div className="h-2 bg-gray-100 rounded w-1/4" />
            </div>
            <div className="h-6 bg-gray-200 rounded w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}
