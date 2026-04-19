import webpush from 'web-push'
import { query } from '../db/index.js'

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@financeiro.msxsystem.site'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

export default async function pushRoutes(app) {
  app.get('/vapid-public-key', async () => ({ publicKey: VAPID_PUBLIC || null }))

  app.post('/subscribe', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { endpoint, keys } = request.body || {}
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return reply.code(400).send({ error: 'Payload inválido' })
    }
    const ua = request.headers['user-agent']?.slice(0, 500) || null
    await query(`
      INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth, user_agent)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, keys_p256dh = $3, keys_auth = $4, user_agent = $5
    `, [request.user.id, endpoint, keys.p256dh, keys.auth, ua])
    return { ok: true }
  })

  app.post('/unsubscribe', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { endpoint } = request.body || {}
    if (!endpoint) return reply.code(400).send({ error: 'endpoint obrigatório' })
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, request.user.id])
    return { ok: true }
  })

  // Debug: envia notificação de teste pro próprio usuário
  app.post('/test', { preHandler: [app.authenticate] }, async (request) => {
    const sent = await sendPushToUser(request.user.id, {
      title: '🔔 Teste de notificação',
      body: 'Se você está vendo isso, as notificações estão funcionando!',
      url: '/'
    })
    return { sent }
  })
}

// Envia push para todas as subscriptions de um usuário
export async function sendPushToUser(userId, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0
  const r = await query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId])
  if (r.rows.length === 0) return 0

  let sent = 0
  const str = JSON.stringify(payload)
  for (const s of r.rows) {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.keys_p256dh, auth: s.keys_auth }
    }
    try {
      await webpush.sendNotification(subscription, str)
      sent++
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]).catch(() => {})
      }
    }
  }
  return sent
}
