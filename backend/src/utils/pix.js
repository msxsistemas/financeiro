// Gerador de payload PIX estático (EMV QR Code)
// Formato: https://www.bcb.gov.br/content/estabilidadefinanceira/SiteAssets/Manual%20do%20BR%20Code.pdf

function tlv(id, value) {
  const len = String(value.length).padStart(2, '0')
  return `${id}${len}${value}`
}

function crc16(payload) {
  let crc = 0xFFFF
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021
      else crc <<= 1
      crc &= 0xFFFF
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Gera o payload do QR Code PIX estático
 * @param {string} pixKey - Chave PIX (CPF, CNPJ, email, telefone, chave aleatória)
 * @param {string} merchantName - Nome do recebedor (max 25 chars)
 * @param {string} merchantCity - Cidade do recebedor (max 15 chars)
 * @param {number|null} amount - Valor (null = sem valor fixo)
 * @param {string} reference - Referência/identificador (max 25 chars)
 */
export function generatePixPayload(pixKey, merchantName, merchantCity = 'Brasil', amount = null, reference = '***') {
  const name = merchantName.substring(0, 25).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const city = merchantCity.substring(0, 15).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const ref = reference.substring(0, 25)

  const merchantInfo = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', pixKey)

  const additionalData = tlv('05', ref)

  let payload = ''
  payload += tlv('00', '01')                             // Payload format indicator
  payload += tlv('01', '12')                             // Reusable QR code
  payload += tlv('26', merchantInfo)                     // Merchant account info
  payload += tlv('52', '0000')                           // MCC
  payload += tlv('53', '986')                            // Currency BRL
  if (amount && amount > 0) {
    payload += tlv('54', amount.toFixed(2))              // Amount
  }
  payload += tlv('58', 'BR')                             // Country
  payload += tlv('59', name)                             // Merchant name
  payload += tlv('60', city)                             // Merchant city
  payload += tlv('62', additionalData)                   // Additional data
  payload += '6304'                                      // CRC placeholder

  payload += crc16(payload)
  return payload
}
