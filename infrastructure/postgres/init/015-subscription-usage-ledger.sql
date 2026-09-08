CREATE TABLE workspace.subscription_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace.workspaces(id) ON DELETE CASCADE,
  requested_plan text NOT NULL REFERENCES workspace.plan_catalog(plan_key),
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'cancelled', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX workspace_one_pending_subscription_change_idx
  ON workspace.subscription_changes(workspace_id) WHERE status = 'pending';

CREATE TABLE agent.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES agent.jobs(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('agent.job.created')),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, metric)
);
CREATE INDEX agent_usage_workspace_time_idx ON agent.usage_events(workspace_id, occurred_at DESC);
