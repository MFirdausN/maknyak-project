CREATE SCHEMA IF NOT EXISTS agent;

CREATE TABLE agent.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  agent_key text NOT NULL CHECK (agent_key IN ('project-planner-v1')),
  goal text NOT NULL CHECK (char_length(goal) BETWEEN 20 AND 4000),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'awaiting_approval', 'succeeded', 'failed', 'rejected', 'cancelled')),
  phase text NOT NULL DEFAULT 'plan' CHECK (phase IN ('plan', 'finalize')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  error_code text,
  trace_id text,
  locked_at timestamptz,
  locked_by text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL
);

CREATE INDEX agent_jobs_queue_idx ON agent.jobs(status, next_attempt_at, created_at)
  WHERE status = 'queued';
CREATE INDEX agent_jobs_workspace_time_idx ON agent.jobs(workspace_id, created_at DESC, id DESC);
CREATE INDEX agent_jobs_expiry_idx ON agent.jobs(expires_at);

CREATE TABLE agent.steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES agent.jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
  attempt integer NOT NULL,
  input jsonb,
  output jsonb,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX agent_steps_job_time_idx ON agent.steps(job_id, started_at, id);

CREATE TABLE agent.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES agent.jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_by uuid NOT NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX agent_one_decision_idx ON agent.approvals(job_id);

CREATE TABLE agent.capability_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES agent.jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('artifact.write')),
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (job_id, scope)
);

CREATE TABLE agent.artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES agent.jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('project-plan')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  media_type text NOT NULL DEFAULT 'application/json',
  content jsonb NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 262144),
  checksum_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX agent_artifacts_workspace_time_idx ON agent.artifacts(workspace_id, created_at DESC, id DESC);
CREATE INDEX agent_artifacts_expiry_idx ON agent.artifacts(expires_at);

