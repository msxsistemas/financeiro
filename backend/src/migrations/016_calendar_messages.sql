-- Mensagem padrão de lembrete de agendamento (por usuário)
ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_default_message TEXT;

-- Mensagem personalizada por agendamento (sobrescreve a padrão do usuário)
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS custom_message TEXT;
