import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { query, logActivity } from '../db/index.js'

export default async function authRoutes(app) {
  // Login (com suporte a 2FA)
  app.post('/login', async (request, reply) => {
    const { email, password, totp_code } = request.body

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email e senha são obrigatórios' })
    }

    const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()])
    const user = result.rows[0]

    if (!user) return reply.code(401).send({ error: 'Credenciais inválidas' })

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return reply.code(401).send({ error: 'Credenciais inválidas' })

    // Verificar 2FA se habilitado
    if (user.totp_enabled) {
      if (!totp_code) {
        // Sinaliza que precisa do código 2FA
        return reply.code(200).send({ requires_2fa: true })
      }
      const isValid = authenticator.check(totp_code, user.totp_secret)
      if (!isValid) return reply.code(401).send({ error: 'Código 2FA inválido' })
    }

    // Access token (curta duracao) + Refresh token (longa duracao)
    const token = app.jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      { expiresIn: '1d' }
    )
    const refreshToken = crypto.randomBytes(64).toString('hex')
    const refreshExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 dias

    // Salvar refresh token no banco
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET token = $2, expires_at = $3, created_at = NOW()`,
      [user.id, refreshToken, refreshExpires]
    ).catch(() => {})

    await logActivity(user.id, 'LOGIN', 'user', user.id, 'Login realizado')

    // Set httpOnly cookies
    reply.setCookie('fin_token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 // 1 day
    })
    reply.setCookie('fin_refresh', refreshToken, {
      path: '/api/auth/refresh',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    })

    return {
      token,
      refresh_token: refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    }
  })

  // Refresh token — gerar novo access token
  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.body?.refresh_token || request.cookies?.fin_refresh
    if (!refreshToken) return reply.code(401).send({ error: 'Refresh token ausente' })

    const result = await query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
      [refreshToken]
    )
    if (!result.rows[0]) return reply.code(401).send({ error: 'Refresh token invalido ou expirado' })

    const userId = result.rows[0].user_id
    const userRes = await query('SELECT id, email, name, role FROM users WHERE id = $1', [userId])
    if (!userRes.rows[0]) return reply.code(401).send({ error: 'Usuario nao encontrado' })

    const user = userRes.rows[0]
    const newToken = app.jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      { expiresIn: '1d' }
    )

    reply.setCookie('fin_token', newToken, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60
    })

    return { token: newToken, user }
  })

  // Logout (limpa httpOnly cookies + invalida refresh token)
  app.post('/logout', async (request, reply) => {
    const refreshToken = request.cookies?.fin_refresh
    if (refreshToken) {
      await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]).catch(() => {})
    }
    reply.clearCookie('fin_token', { path: '/' })
    reply.clearCookie('fin_refresh', { path: '/api/auth/refresh' })
    return { message: 'Logout realizado' }
  })

  // Perfil atual
  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const result = await query(
      'SELECT id, name, email, role, totp_enabled, pix_key, pix_key_type, created_at FROM users WHERE id = $1',
      [request.user.id]
    )
    return result.rows[0]
  })

  // Atualizar perfil (nome, email, PIX)
  app.put('/profile', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { name, email, pix_key, pix_key_type } = request.body
    const fields = []
    const values = []
    let idx = 1

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name) }
    if (email !== undefined) {
      // Verificar se email já está em uso por outro usuário
      const existing = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, request.user.id])
      if (existing.rows.length > 0) return reply.code(400).send({ error: 'Email já está em uso' })
      fields.push(`email = $${idx++}`); values.push(email)
    }
    if (pix_key !== undefined) { fields.push(`pix_key = $${idx++}`); values.push(pix_key || null) }
    if (pix_key_type !== undefined) { fields.push(`pix_key_type = $${idx++}`); values.push(pix_key_type || null) }

    if (fields.length === 0) return reply.code(400).send({ error: 'Nenhum campo para atualizar' })

    values.push(request.user.id)
    await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values)
    return { message: 'Perfil atualizado' }
  })

  // Alterar senha
  app.put('/password', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { current_password, new_password } = request.body

    if (!current_password || !new_password) {
      return reply.code(400).send({ error: 'Senha atual e nova senha são obrigatórias' })
    }
    if (new_password.length < 6) {
      return reply.code(400).send({ error: 'Nova senha deve ter pelo menos 6 caracteres' })
    }

    const result = await query('SELECT * FROM users WHERE id = $1', [request.user.id])
    const valid = await bcrypt.compare(current_password, result.rows[0].password_hash)
    if (!valid) return reply.code(401).send({ error: 'Senha atual incorreta' })

    const hash = await bcrypt.hash(new_password, 10)
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, request.user.id])
    return { message: 'Senha alterada com sucesso' }
  })

  // 2FA — Gerar QR Code para configuração
  app.get('/2fa/setup', { preHandler: [app.authenticate] }, async (request) => {
    const secret = authenticator.generateSecret()
    const userRes = await query('SELECT email FROM users WHERE id = $1', [request.user.id])
    const email = userRes.rows[0].email

    // Salvar secret temporariamente
    await query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret, request.user.id])

    const otpauthUrl = authenticator.keyuri(email, 'Financeiro MSX', secret)
    const qrCode = await QRCode.toDataURL(otpauthUrl)

    return { secret, qr_code: qrCode, otp_url: otpauthUrl }
  })

  // 2FA — Ativar (confirmar com código)
  app.post('/2fa/enable', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { code } = request.body
    if (!code) return reply.code(400).send({ error: 'Código é obrigatório' })

    const userRes = await query('SELECT totp_secret FROM users WHERE id = $1', [request.user.id])
    const secret = userRes.rows[0]?.totp_secret
    if (!secret) return reply.code(400).send({ error: 'Configure o 2FA primeiro' })

    const isValid = authenticator.check(code, secret)
    if (!isValid) return reply.code(401).send({ error: 'Código inválido. Verifique o app autenticador.' })

    await query('UPDATE users SET totp_enabled = true WHERE id = $1', [request.user.id])
    return { message: '2FA ativado com sucesso!' }
  })

  // 2FA — Desativar
  app.post('/2fa/disable', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { code } = request.body
    if (!code) return reply.code(400).send({ error: 'Código 2FA é necessário para desativar' })

    const userRes = await query('SELECT totp_secret, totp_enabled FROM users WHERE id = $1', [request.user.id])
    if (!userRes.rows[0]?.totp_enabled) return reply.code(400).send({ error: '2FA não está ativado' })

    const isValid = authenticator.check(code, userRes.rows[0].totp_secret)
    if (!isValid) return reply.code(401).send({ error: 'Código inválido' })

    await query('UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1', [request.user.id])
    return { message: '2FA desativado' }
  })

  // Criar usuário (apenas admin)
  app.post('/register', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'admin') return reply.code(403).send({ error: 'Acesso negado' })

    const { name, email, password } = request.body
    if (!name || !email || !password) return reply.code(400).send({ error: 'Nome, email e senha são obrigatórios' })

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
    if (existing.rows.length > 0) return reply.code(409).send({ error: 'Email já cadastrado' })

    const hash = await bcrypt.hash(password, 10)
    const result = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role',
      [name, email.toLowerCase(), hash]
    )
    return result.rows[0]
  })

  // Marcar onboarding como completo
  app.put('/onboarding', { preHandler: [app.authenticate] }, async (request) => {
    await query('UPDATE users SET onboarding_completed = true WHERE id = $1', [request.user.id]).catch(() => {})
    return { ok: true }
  })
}
