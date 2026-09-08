CREATE TABLE workspace.billing_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('subscription.activated')),
  workspace_id uuid NOT NULL REFERENCES workspace.workspaces(id) ON DELETE CASCADE,
  plan_key text NOT NULL REFERENCES workspace.plan_catalog(plan_key),
  payload_hash text NOT NULL,
  occurred_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
CREATE INDEX workspace_billing_events_workspace_time_idx
  ON workspace.billing_events(workspace_id, processed_at DESC);

ALTER TABLE workspace.subscription_changes
  ADD COLUMN resolved_by_provider text,
  ADD COLUMN resolved_by_event_id text;
