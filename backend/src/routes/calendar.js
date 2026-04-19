import { query, logActivity } from '../db/index.js'
import { google } from 'googleapis'
import axios from 'axios'
import 'dotenv/config'

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

const DEFAULT_CALENDAR_MESSAGE = `🔔 *Lembrete:* {titulo}
📅 {data} às {hora}{descricao}`

export default async function calendarRoutes(app) {
  // Mensagem padrão (template) do usuário
  app.get('/default-message', { preHandler: [app.authenticate] }, async (request) => {
    const r = await query('SELECT calendar_default_message FROM users WHERE id = $1', [request.user.id])
    return {
      message: r.rows[0]?.calendar_default_message || DEFAULT_CALENDAR_MESSAGE,
      is_default: !r.rows[0]?.calendar_default_message,
      default_template: DEFAULT_CALENDAR_MESSAGE
    }
  })

  app.put('/default-message', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { message } = request.body
    await query('UPDATE users SET calendar_default_message = $1 WHERE id = $2', [message || null, request.user.id])
    return { ok: true }
  })

  // Enviar lembrete imediato de um agendamento
  app.post('/:id/notify', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { id } = request.params
    const r = await query(`
      SELECT ce.*, ws.instance_token, u.calendar_default_message AS user_default_message
      FROM calendar_events ce
      JOIN users u ON u.id = ce.user_id
      LEFT JOIN whatsapp_settings ws ON ws.user_id = ce.user_id
      WHERE ce.id = $1 AND ce.user_id = $2 AND ce.deleted_at IS NULL
    `, [id, userId])
    const ev = r.rows[0]
    if (!ev) return reply.code(404).send({ error: 'Agendamento não encontrado' })
    if (!ev.notify_phone) return reply.code(400).send({ error: 'Agendamento sem telefone' })
    if (!ev.instance_token) return reply.code(400).send({ error: 'WhatsApp não conectado' })

    const d = new Date(ev.start_date)
    const data = d.toLocaleDateString('pt-BR')
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const template = ev.custom_message || ev.user_default_message
    const descSuffix = ev.description ? '\n📝 ' + ev.description : ''
    const message = template
      ? template
          .replace(/\{titulo\}/g, ev.title || '')
          .replace(/\{data\}/g, data)
          .replace(/\{hora\}/g, hora)
          .replace(/\{descricao\}/g, descSuffix)
      : `🔔 *Lembrete:* ${ev.title}\n📅 ${data} às ${hora}${descSuffix}`

    try {
      await axios.post(`${process.env.UAZAPI_URL}/send/text`, {
        number: ev.notify_phone.replace(/\D/g, ''),
        text: message
      }, { headers: { token: ev.instance_token }, timeout: 15000 })
      return { ok: true }
    } catch (err) {
      return reply.code(500).send({ error: err.response?.data?.error || err.message })
    }
  })

  // Listar eventos
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id
    const { start_date, end_date, page = 1, limit = 20 } = request.query

    const conditions = ['user_id = $1', 'deleted_at IS NULL']
    const params = [userId]
    let idx = 2

    if (start_date) { conditions.push(`start_date >= $${idx++}`); params.push(start_date) }
    if (end_date) { conditions.push(`start_date <= $${idx++}`); params.push(end_date + ' 23:59:59') }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const where = conditions.join(' AND ')

    const countRes = await query(`SELECT COUNT(*) FROM calendar_events WHERE ${where}`, params)
    const total = parseInt(countRes.rows[0].count)

    const result = await query(`
      SELECT * FROM calendar_events WHERE ${where}
      ORDER BY start_date ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, parseInt(limit), offset])

    return { data: result.rows, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) }
  })

  // Criar evento
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { title, description, start_date, end_date, notify_whatsapp, notify_phone, reminder_minutes, custom_message } = request.body

    if (!title || !start_date) return reply.code(400).send({ error: 'Título e data de início são obrigatórios' })

    let google_event_id = null

    // Tentar sincronizar com Google Calendar se configurado
    const tokenRes = await query('SELECT * FROM google_tokens WHERE user_id = $1', [userId])
    if (tokenRes.rows[0] && process.env.GOOGLE_CLIENT_ID) {
      try {
        const oauth2Client = getOAuth2Client()
        oauth2Client.setCredentials({
          access_token: tokenRes.rows[0].access_token,
          refresh_token: tokenRes.rows[0].refresh_token,
          expiry_date: tokenRes.rows[0].expiry_date
        })

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
        const event = await calendar.events.insert({
          calendarId: 'primary',
          resource: {
            summary: title,
            description: description || '',
            start: { dateTime: new Date(start_date).toISOString() },
            end: { dateTime: end_date ? new Date(end_date).toISOString() : new Date(new Date(start_date).getTime() + 3600000).toISOString() },
            reminders: {
              useDefault: false,
              overrides: [{ method: 'popup', minutes: reminder_minutes || 30 }]
            }
          }
        })
        google_event_id = event.data.id

        // Atualizar tokens se renovados
        const newTokens = oauth2Client.credentials
        if (newTokens.access_token) {
          await query('UPDATE google_tokens SET access_token = $1, expiry_date = $2, updated_at = NOW() WHERE user_id = $3',
            [newTokens.access_token, newTokens.expiry_date, userId])
        }
      } catch (err) {
        console.error('Erro ao criar evento no Google Calendar:', err.message)
      }
    }

    const result = await query(`
      INSERT INTO calendar_events (title, description, start_date, end_date, google_event_id, notify_whatsapp, notify_phone, reminder_minutes, custom_message, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [title, description || null, start_date, end_date || null, google_event_id, notify_whatsapp || false, notify_phone || null, reminder_minutes || 30, custom_message || null, userId])

    await logActivity(userId, 'CREATE', 'calendar_event', result.rows[0].id, `Evento criado: ${title}`)
    return reply.code(201).send(result.rows[0])
  })

  // Atualizar evento
  app.put('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { title, description, start_date, end_date, notify_whatsapp, notify_phone, reminder_minutes, custom_message } = request.body

    const check = await query('SELECT * FROM calendar_events WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    if (!check.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })

    const event = check.rows[0]

    // Atualizar no Google se tiver event_id
    if (event.google_event_id && process.env.GOOGLE_CLIENT_ID) {
      try {
        const tokenRes = await query('SELECT * FROM google_tokens WHERE user_id = $1', [userId])
        if (tokenRes.rows[0]) {
          const oauth2Client = getOAuth2Client()
          oauth2Client.setCredentials({
            access_token: tokenRes.rows[0].access_token,
            refresh_token: tokenRes.rows[0].refresh_token,
          })
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
          await calendar.events.update({
            calendarId: 'primary',
            eventId: event.google_event_id,
            resource: {
              summary: title,
              description: description || '',
              start: { dateTime: new Date(start_date).toISOString() },
              end: { dateTime: end_date ? new Date(end_date).toISOString() : new Date(new Date(start_date).getTime() + 3600000).toISOString() }
            }
          })
        }
      } catch (err) {
        console.error('Erro ao atualizar Google Calendar:', err.message)
      }
    }

    const result = await query(`
      UPDATE calendar_events SET
        title = $1, description = $2, start_date = $3, end_date = $4,
        notify_whatsapp = $5, notify_phone = $6, reminder_minutes = $7,
        custom_message = $8, updated_at = NOW()
      WHERE id = $9 AND user_id = $10 AND deleted_at IS NULL RETURNING *
    `, [title, description || null, start_date, end_date || null, notify_whatsapp || false, notify_phone || null, reminder_minutes || 30, custom_message || null, request.params.id, userId])

    return result.rows[0]
  })

  // Deletar evento
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const check = await query('SELECT * FROM calendar_events WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    if (!check.rows[0]) return reply.code(404).send({ error: 'Não encontrado' })

    const event = check.rows[0]

    if (event.google_event_id && process.env.GOOGLE_CLIENT_ID) {
      try {
        const tokenRes = await query('SELECT * FROM google_tokens WHERE user_id = $1', [userId])
        if (tokenRes.rows[0]) {
          const oauth2Client = getOAuth2Client()
          oauth2Client.setCredentials({ access_token: tokenRes.rows[0].access_token, refresh_token: tokenRes.rows[0].refresh_token })
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
          await calendar.events.delete({ calendarId: 'primary', eventId: event.google_event_id })
        }
      } catch (err) {
        console.error('Erro ao deletar Google Calendar:', err.message)
      }
    }

    await query('UPDATE calendar_events SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [request.params.id, userId])
    return { message: 'Removido com sucesso' }
  })

  // OAuth Google - Iniciar
  app.get('/google/auth-url', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return reply.code(400).send({ error: 'Google Calendar não configurado no servidor' })
    }
    const oauth2Client = getOAuth2Client()
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state: request.user.id
    })
    return { url }
  })

  // OAuth Google - Callback
  app.get('/callback', async (request, reply) => {
    const { code, state: userId } = request.query

    if (!code || !userId) {
      return reply.redirect(`${process.env.FRONTEND_URL}/calendar?error=auth_failed`)
    }

    try {
      const oauth2Client = getOAuth2Client()
      const { tokens } = await oauth2Client.getToken(code)

      await query(`
        INSERT INTO google_tokens (user_id, access_token, refresh_token, expiry_date)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE SET
          access_token = $2, refresh_token = COALESCE($3, google_tokens.refresh_token),
          expiry_date = $4, updated_at = NOW()
      `, [userId, tokens.access_token, tokens.refresh_token || null, tokens.expiry_date || null])

      return reply.redirect(`${process.env.FRONTEND_URL}/calendar?connected=true`)
    } catch (err) {
      console.error('Erro no callback Google OAuth:', err)
      return reply.redirect(`${process.env.FRONTEND_URL}/calendar?error=auth_failed`)
    }
  })

  // Status conexão Google
  app.get('/google/status', { preHandler: [app.authenticate] }, async (request) => {
    const result = await query('SELECT id, created_at, updated_at FROM google_tokens WHERE user_id = $1', [request.user.id])
    return { connected: result.rows.length > 0, token: result.rows[0] || null }
  })

  // Desconectar Google
  app.delete('/google/disconnect', { preHandler: [app.authenticate] }, async (request) => {
    await query('DELETE FROM google_tokens WHERE user_id = $1', [request.user.id])
    return { message: 'Google Calendar desconectado' }
  })
}
