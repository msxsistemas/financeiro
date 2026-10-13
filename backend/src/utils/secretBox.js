// Criptografia reversivel (AES-256-GCM) para segredos que o usuario precisa ver de volta,
// como senhas de paineis. Chave: ENCRYPTION_KEY (ou JWT_SECRET como fallback).
// ATENCAO: trocar a chave torna ilegiveis os valores ja salvos.
import crypto from 'crypto'

const PREFIX = 'enc:v1:'

function getKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'change_this_secret_in_production'
  return crypto.createHash('sha256').update(secret).digest()
}

export const isEncrypted = v => typeof v === 'string' && v.startsWith(PREFIX)

export function encryptSecret(plain) {
  if (plain == null || plain === '') return null
  if (isEncrypted(plain)) return plain
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + [iv, tag, data].map(b => b.toString('base64')).join(':')
}

export function decryptSecret(value) {
  if (!isEncrypted(value)) return value ?? null // valores antigos em texto puro
  try {
    const [iv, tag, data] = value.slice(PREFIX.length).split(':').map(s => Buffer.from(s, 'base64'))
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
