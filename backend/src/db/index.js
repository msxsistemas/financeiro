import pg from 'pg'
import 'dotenv/config'

const { Pool } = pg

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

db.on('error', (err) => {
  console.error('Erro no pool do PostgreSQL:', err)
})

export async function query(text, params) {
  const client = await db.connect()
  try {
    const result = await client.query(text, params)
    return result
  } finally {
    client.release()
  }
}

export async function logActivity(userId, action, entity, entityId, description) {
  try {
    await query(
      'INSERT INTO activity_log (user_id, action, entity, entity_id, description) VALUES ($1, $2, $3, $4, $5)',
      [userId, action, entity, entityId, description]
    )
  } catch (err) {
    console.error('Erro ao registrar atividade:', err)
  }
}
