ALTER TABLE workspace.outbox
  ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS outbox_delivery_idx
  ON workspace.outbox(occurred_at)
  WHERE published_at IS NULL;
