ALTER TABLE agent.jobs DROP CONSTRAINT IF EXISTS agent_jobs_agent_key_check;
ALTER TABLE agent.jobs ADD CONSTRAINT agent_jobs_agent_key_check
  CHECK (agent_key IN ('project-planner-v1', 'qa-reviewer-v1'));

ALTER TABLE agent.artifacts DROP CONSTRAINT IF EXISTS agent_artifacts_kind_check;
ALTER TABLE agent.artifacts ADD CONSTRAINT agent_artifacts_kind_check
  CHECK (kind IN ('project-plan', 'qa-report'));
