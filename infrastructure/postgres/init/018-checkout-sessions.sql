CREATE TABLE workspace.checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_change_id uuid NOT NULL UNIQUE REFERENCES workspace.subscription_changes(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspace.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_order_id text NOT NULL,
  amount_idr integer NOT NULL CHECK (amount_idr > 0),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'pending', 'paid', 'expired', 'cancelled', 'failed')),
  provider_token_hash text,
  redirect_url text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_order_id)
);
CREATE INDEX workspace_checkout_sessions_workspace_time_idx
  ON workspace.checkout_sessions(workspace_id, created_at DESC);
