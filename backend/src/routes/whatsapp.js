import { query, logActivity } from '../db/index.js'
import axios from 'axios'

const ADMIN_TOKEN = process.env.UAZAPI_TOKEN   // admintoken — para criar instâncias
const SERVER_URL  = process.env.UAZAPI_URL      // https://gestormsx.uazapi.com

// Retorna o instance token salvo no banco para o usuário
const getInstanceToken = async (userId) => {
  const r = await query('SELECT instance_token FROM whatsapp_settings WHERE user_id = $1', [userId])
  return r.rows[0]?.instance_token || null
}

// Salva o instance token gerado pelo uazapi após criar a instância
const saveInstanceToken = async (userId, instanceToken) => {
  await query(`
    INSERT INTO whatsapp_settings (user_id, server_url, instance_token, active)
    VALUES ($1, $2, $3, true)
    ON CONFLICT (user_id) DO UPDATE SET instance_token = $3, active = true, updated_at = NOW()
  `, [userId, SERVER_URL, instanceToken])
}

export default async function whatsappRoutes(app) {
  // Buscar configurações (notify_phone + se tem instância)
  app.get('/settings', { preHandler: [app.authenticate] }, async (request) => {
    const r = await query(
      'SELECT instance_token, notify_phone FROM whatsapp_settings WHERE user_id = $1',
      [request.user.id]
    )
    return {
      configured: !!SERVER_URL && !!ADMIN_TOKEN,
      has_instance: !!r.rows[0]?.instance_token,
      notify_phone: r.rows[0]?.notify_phone || ''
    }
  })

  // Salvar número de notificação
  app.post('/settings', { preHandler: [app.authenticate] }, async (request) => {
    const { notify_phone } = request.body
    await query(`
      INSERT INTO whatsapp_settings (user_id, server_url, instance_token, active, notify_phone)
      VALUES ($1, '', '', true, $2)
      ON CONFLICT (user_id) DO UPDATE SET notify_phone = $2, updated_at = NOW()
    `, [request.user.id, notify_phone || null])
    return { message: 'Salvo!' }
  })

  // Conectar: cria instância (se não existir) + gera QR code
  app.post('/connect', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!SERVER_URL || !ADMIN_TOKEN) {
      return reply.code(503).send({ error: 'WhatsApp não configurado no servidor' })
    }

    const userId = request.user.id
    let instanceToken = await getInstanceToken(userId)

    // Se não tem instância, cria uma nova
    if (!instanceToken) {
      try {
        const res = await axios.post(`${SERVER_URL}/instance/create`, {
          name: `fin_${userId.slice(0, 8)}`
        }, {
          headers: { admintoken: ADMIN_TOKEN, 'Content-Type': 'application/json' },
          timeout: 15000
        })
        instanceToken = res.data?.instance?.token
        if (!instanceToken) return reply.code(500).send({ error: 'Falha ao obter token da instância criada' })
        await saveInstanceToken(userId, instanceToken)
      } catch (err) {
        return reply.code(500).send({ error: err.response?.data?.error || 'Erro ao criar instância' })
      }
    }

    // Chama connect para iniciar geração do QR code
    try {
      await axios.post(`${SERVER_URL}/instance/connect`, {}, {
        headers: { token: instanceToken, 'Content-Type': 'application/json' },
        timeout: 15000
      })
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 401) {
        await query('UPDATE whatsapp_settings SET instance_token = NULL WHERE user_id = $1', [userId])
      }
      return reply.code(500).send({ error: err.response?.data?.error || 'Erro ao conectar instância' })
    }

    // Polling: aguardar QR code ficar pronto (uazapi leva alguns segundos)
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(1500)
      try {
        const statusRes = await axios.get(`${SERVER_URL}/instance/status`, {
          headers: { token: instanceToken },
          timeout: 5000
        })
        const data = statusRes.data
        const qr = data?.instance?.qrcode || ''
        const isConnected = data?.status?.connected
        if (qr || isConnected) return data
      } catch {}
    }

    // Retornar status mesmo sem QR (frontend fará polling via /status)
    try {
      const finalRes = await axios.get(`${SERVER_URL}/instance/status`, {
        headers: { token: instanceToken },
        timeout: 5000
      })
      return finalRes.data
    } catch {
      return { connected: false, qrcode: null, message: 'QR code ainda sendo gerado. Aguarde.' }
    }
  })

  // Status da instância
  app.get('/status', { preHandler: [app.authenticate] }, async (request, reply) => {
    const instanceToken = await getInstanceToken(request.user.id)
    if (!instanceToken) return { connected: false, loggedIn: false, no_instance: true }

    try {
      const res = await axios.get(`${SERVER_URL}/instance/status`, {
        headers: { token: instanceToken },
        timeout: 5000
      })
      return res.data
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 404) {
        return { connected: false, loggedIn: false, no_instance: true }
      }
      return { connected: false, loggedIn: false, error: err.response?.data?.error || err.message }
    }
  })

  // Deletar instância
  app.delete('/instance', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const instanceToken = await getInstanceToken(userId)
    if (!instanceToken) return reply.code(404).send({ error: 'Nenhuma instância ativa' })

    try {
      await axios.delete(`${SERVER_URL}/instance`, {
        headers: { token: instanceToken },
        timeout: 10000
      })
    } catch (err) {
      // Se já foi deletada externamente, apenas limpa o banco
      if (err.response?.status !== 404) {
        return reply.code(500).send({ error: err.response?.data?.error || 'Erro ao deletar instância' })
      }
    }

    await query('UPDATE whatsapp_settings SET instance_token = NULL WHERE user_id = $1', [userId])
    await logActivity(userId, 'WHATSAPP_INSTANCE_DELETE', 'whatsapp', null, 'Instância deletada')
    return { success: true }
  })

  // Enviar mensagem de texto
  app.post('/send', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { number, text, delay } = request.body
    if (!number || !text) return reply.code(400).send({ error: 'Número e texto são obrigatórios' })

    const instanceToken = await getInstanceToken(request.user.id)
    if (!instanceToken) return reply.code(400).send({ error: 'WhatsApp não conectado' })

    const cleanNumber = number.replace(/\D/g, '')

    try {
      const res = await axios.post(`${SERVER_URL}/send/text`, {
        number: cleanNumber,
        text,
        delay: delay || 1000
      }, {
        headers: { token: instanceToken, 'Content-Type': 'application/json' },
        timeout: 15000
      })
      await logActivity(request.user.id, 'WHATSAPP_SEND', 'whatsapp', null, `Mensagem enviada para ${cleanNumber}`)
      return { success: true, data: res.data }
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.response?.data?.error || err.message })
    }
  })

  // Notificar dívida via WhatsApp
  app.post('/notify-debt/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { custom_message } = request.body

    const debtRes = await query('SELECT * FROM debts WHERE id = $1 AND user_id = $2', [request.params.id, userId])
    if (!debtRes.rows[0]) return reply.code(404).send({ error: 'Dívida não encontrada' })

    const debt = debtRes.rows[0]
    if (!debt.contact_phone) return reply.code(400).send({ error: 'Contato sem número de telefone' })

    const instanceToken = await getInstanceToken(userId)
    if (!instanceToken) return reply.code(400).send({ error: 'WhatsApp não conectado' })

    const remaining = parseFloat(debt.amount) - parseFloat(debt.paid_amount)
    const dueDate = debt.due_date ? new Date(debt.due_date).toLocaleDateString('pt-BR') : 'não definido'

    const message = custom_message || (debt.type === 'receivable'
      ? `Olá ${debt.contact_name || ''}! 👋\n\nPassando para lembrar sobre o valor de *R$ ${remaining.toFixed(2).replace('.', ',')}* referente a: *${debt.description}*\n\nVencimento: ${dueDate}\n\nQualquer dúvida, estou à disposição!`
      : `Lembrete: Você tem uma dívida de *R$ ${remaining.toFixed(2).replace('.', ',')}* com ${debt.contact_name || 'credor'}\nReferente a: ${debt.description}\nVencimento: ${dueDate}`)

    const cleanNumber = debt.contact_phone.replace(/\D/g, '')

    try {
      await axios.post(`${SERVER_URL}/send/text`, {
        number: cleanNumber,
        text: message
      }, {
        headers: { token: instanceToken, 'Content-Type': 'application/json' },
        timeout: 15000
      })

      await logActivity(userId, 'WHATSAPP_DEBT_NOTIFY', 'debt', debt.id,
        `Notificação enviada para ${debt.contact_name} (${cleanNumber})`)
      return { success: true }
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.response?.data?.error || err.message })
    }
  })
}
