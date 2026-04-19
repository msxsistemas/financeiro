-- 022_clean_admin_data.sql
-- Admin é conta de gerência: não deve possuir dados no painel de usuário.
-- Remove qualquer dado financeiro/operacional associado a user_id com role='admin'.
-- Mantém intactos: users, activity_log (auditoria), refresh_tokens, push_subscriptions.
-- Idempotente: rodar múltiplas vezes é seguro (apaga apenas o que existir).

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'transactions', 'debts', 'debt_payments',
    'products', 'stock_movements',
    'categories', 'tags', 'transaction_tags',
    'budgets', 'contacts',
    'monthly_income_goals', 'savings_goals',
    'accounts', 'account_transfers',
    'credit_cards', 'credit_card_bills', 'credit_card_expenses',
    'splits', 'split_items',
    'loans', 'loan_installments',
    'calendar_events',
    'whatsapp_settings', 'whatsapp_log',
    'webhook_secrets', 'google_tokens',
    'iptv_servers', 'iptv_resellers', 'iptv_my_clients', 'iptv_debts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'user_id'
    ) THEN
      EXECUTE format(
        'DELETE FROM %I WHERE user_id IN (SELECT id FROM users WHERE role = ''admin'')',
        tbl
      );
    END IF;
  END LOOP;
END $$;
