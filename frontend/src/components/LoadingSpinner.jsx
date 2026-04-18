export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'h-5 w-5 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-4'
  }

  return (
    <div className={`flex justify-center py-12 ${className}`}>
      <div className={`animate-spin rounded-full border-indigo-600 border-t-transparent ${sizes[size] || sizes.md}`} />
    </div>
  )
}
