ALTER TABLE ai.briefs
  ADD COLUMN evaluation jsonb,
  ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days');

ALTER TABLE ai.runs
  ADD COLUMN evaluation jsonb,
  ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days');

CREATE TABLE ai.workspace_limits (
  workspace_id uuid PRIMARY KEY,
  daily_run_limit integer NOT NULL DEFAULT 50 CHECK (daily_run_limit BETWEEN 1 AND 10000),
  max_concurrent_runs integer NOT NULL DEFAULT 2 CHECK (max_concurrent_runs BETWEEN 1 AND 20),
  retention_days integer NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 1 AND 3650),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai.brief_feedback (
  brief_id uuid NOT NULL REFERENCES ai.briefs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brief_id, principal_id)
);

CREATE INDEX ai_feedback_workspace_time_idx
  ON ai.brief_feedback(workspace_id, updated_at DESC);
CREATE INDEX ai_briefs_expiry_idx ON ai.briefs(expires_at);
CREATE INDEX ai_runs_expiry_idx ON ai.runs(expires_at);

