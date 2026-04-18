// Middleware de autorização por role
// Roles: admin (tudo), operator (CRUD), viewer (apenas leitura)

const ROLE_HIERARCHY = {
  admin: 3,
  operator: 2,
  viewer: 1
}

export function authorize(...allowedRoles) {
  return async (request, reply) => {
    const userRole = request.user?.role || 'viewer'
    if (!allowedRoles.includes(userRole)) {
      return reply.code(403).send({ error: 'Acesso negado. Permissão insuficiente.' })
    }
  }
}

// Atalhos comuns
export const adminOnly = authorize('admin')
export const operatorUp = authorize('admin', 'operator')
export const anyRole = authorize('admin', 'operator', 'viewer')
