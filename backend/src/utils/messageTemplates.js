// Templates padrão e helpers de interpolação para mensagens WhatsApp.
// Os templates por usuário são armazenados na tabela `users` (colunas *_message).

export const MESSAGE_DEFAULTS = {
  loan_upcoming: `Olá {nome}! 👋

Lembrete: sua parcela *{parcela}* vence em *{vencimento}*.

💰 Valor: *{valor}*

Evite atrasos e possíveis encargos!`,

  loan_overdue: `Olá {nome}! ⚠️

Sua parcela *{parcela}* está *VENCIDA* desde {vencimento} ({dias_atraso} dia(s) de atraso).

💰 Valor: *{valor}*
⚡ Mora: *{mora}*
💸 Total: *{total}*

Por favor regularize o pagamento o quanto antes.`,

  loan_overdue_multi: `Olá {nome}! ⚠️

Você possui *{parcelas_count} parcela(s) em atraso*:

{parcelas_lista}

💸 *Total em aberto: {total}*

Por favor regularize. Novos encargos serão aplicados por dia de atraso.`,

  delinquent: `Olá {nome}! ⚠️

Você possui débitos em aberto totalizando *{total}*.

Por favor entre em contato para regularizar sua situação.`
}

// Placeholders reconhecidos por cada template — usado pelo frontend para dicas.
export const TEMPLATE_VARIABLES = {
  loan_upcoming: ['nome', 'valor', 'vencimento', 'parcela'],
  loan_overdue: ['nome', 'valor', 'vencimento', 'parcela', 'mora', 'total', 'dias_atraso'],
  loan_overdue_multi: ['nome', 'parcelas_count', 'parcelas_lista', 'total'],
  delinquent: ['nome', 'total']
}

export function interpolate(tpl, vars = {}) {
  if (!tpl) return ''
  let out = String(tpl)
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v == null ? '' : String(v))
  }
  return out
}

export function fmtBRL(v) {
  const n = parseFloat(v)
  if (!isFinite(n)) return 'R$ 0,00'
  return `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}
