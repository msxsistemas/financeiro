export async function authenticate(request, reply) {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.code(401).send({ error: 'Token inválido ou expirado' })
  }
}
