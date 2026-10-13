// Criptografia reversivel (AES-256-GCM) para segredos que o usuario precisa ver de volta,
// como senhas de paineis. Chave: ENCRYPTION_KEY (ou JWT_SECRET como fallback).
// Valores cifrados com a chave antiga (JWT_SECRET) continuam legiveis e sao
// recifrados com a ENCRYPTION_KEY no boot (ver needsReencrypt).
// ATENCAO: perder/trocar a ENCRYPTION_KEY torna ilegiveis os valores ja salvos.
import crypto from 'crypto'

const PREFIX = 'enc:v1:'

const deriveKey = secret => crypto.createHash('sha256').update(secret).digest()
const legacySecret = () => process.env.JWT_SECRET || 'change_this_secret_in_production'
const primaryKey = () => deriveKey(process.env.ENCRYPTION_KEY || legacySecret())
const legacyKey = () => (process.env.ENCRYPTION_KEY ? deriveKey(legacySecret()) : null)

export const isEncrypted = v => typeof v === 'string' && v.startsWith(PREFIX)

export function encryptSecret(plain) {
  if (plain == null || plain === '') return null
  if (isEncrypted(plain)) return plain
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', primaryKey(), iv)
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + [iv, tag, data].map(b => b.toString('base64')).join(':')
}

function decryptWith(key, value) {
  try {
    const [iv, tag, data] = value.slice(PREFIX.length).split(':').map(s => Buffer.from(s, 'base64'))
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

export function decryptSecret(value) {
  if (!isEncrypted(value)) return value ?? null // valores antigos em texto puro
  const plain = decryptWith(primaryKey(), value)
  if (plain != null) return plain
  const legacy = legacyKey()
  return legacy ? decryptWith(legacy, value) : null
}

// true quando o valor esta em texto puro ou cifrado com a chave antiga
export function needsReencrypt(value) {
  if (value == null || value === '') return false
  if (!isEncrypted(value)) return true
  return decryptWith(primaryKey(), value) == null && decryptSecret(value) != null
}
