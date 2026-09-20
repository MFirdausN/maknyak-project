ALTER TABLE agent.notifications
  ADD COLUMN telegram_sent_at timestamptz,
  ADD COLUMN telegram_attempts integer NOT NULL DEFAULT 0 CHECK (telegram_attempts >= 0),
  ADD COLUMN telegram_next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN telegram_locked_at timestamptz,
  ADD COLUMN telegram_locked_by text,
  ADD COLUMN telegram_error_code text;

CREATE INDEX agent_notifications_telegram_delivery_idx
  ON agent.notifications(telegram_next_attempt_at, created_at)
  WHERE telegram_sent_at IS NULL AND telegram_attempts < 5;
