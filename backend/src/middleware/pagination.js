// Middleware de paginacao padronizada
export function parsePagination(request, defaultLimit = 20) {
  const page = Math.max(1, parseInt(request.query.page) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(request.query.limit) || defaultLimit))
  const offset = (page - 1) * limit
  return { page, limit, offset }
}

export function paginatedResponse(rows, total, page, limit) {
  return {
    data: rows,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    has_more: page < Math.ceil(total / limit)
  }
}
