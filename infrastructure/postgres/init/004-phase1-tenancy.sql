CREATE TABLE IF NOT EXISTS audit.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  principal_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_workspace_time_idx
  ON audit.events(workspace_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_principal_time_idx
  ON audit.events(principal_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION audit.reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit.events;
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit.events
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE TABLE IF NOT EXISTS workspace.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(email)),
  role text NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid NOT NULL,
  accepted_by uuid,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_email_idx
  ON workspace.invitations(workspace_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS invitations_expiry_idx
  ON workspace.invitations(expires_at)
  WHERE status = 'pending';
