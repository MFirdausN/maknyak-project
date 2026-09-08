CREATE TABLE workspace.plan_catalog (
  plan_key text PRIMARY KEY,
  display_name text NOT NULL,
  member_limit integer NOT NULL CHECK (member_limit > 0),
  daily_agent_job_limit integer NOT NULL CHECK (daily_agent_job_limit > 0),
  retention_days integer NOT NULL CHECK (retention_days > 0),
  active boolean NOT NULL DEFAULT true
);

INSERT INTO workspace.plan_catalog (plan_key, display_name, member_limit, daily_agent_job_limit, retention_days)
VALUES ('free', 'Free', 5, 25, 30), ('team', 'Team', 50, 500, 365)
ON CONFLICT (plan_key) DO NOTHING;

CREATE TABLE workspace.entitlements (
  workspace_id uuid PRIMARY KEY REFERENCES workspace.workspaces(id) ON DELETE CASCADE,
  plan_key text NOT NULL REFERENCES workspace.plan_catalog(plan_key),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO workspace.entitlements (workspace_id, plan_key)
SELECT id, 'free' FROM workspace.workspaces ON CONFLICT (workspace_id) DO NOTHING;
