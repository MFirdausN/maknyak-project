ALTER TABLE agent.artifacts
  ALTER COLUMN content DROP NOT NULL,
  ADD COLUMN storage_backend text NOT NULL DEFAULT 'postgres' CHECK (storage_backend IN ('postgres', 'minio')),
  ADD COLUMN object_key text;

CREATE UNIQUE INDEX agent_artifacts_object_key_idx
  ON agent.artifacts(object_key) WHERE object_key IS NOT NULL;

CREATE TABLE agent.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES agent.jobs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('approval_required', 'job_completed', 'job_failed')),
  minimum_role text NOT NULL CHECK (minimum_role IN ('viewer', 'member', 'admin', 'owner')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  read_by uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (job_id, kind)
);

CREATE INDEX agent_notifications_workspace_time_idx
  ON agent.notifications(workspace_id, created_at DESC, id DESC);
CREATE INDEX agent_notifications_expiry_idx ON agent.notifications(expires_at);

