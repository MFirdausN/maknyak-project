-- PostgreSQL generated these legacy names without the schema prefix. Migration
-- 012 installs explicitly named replacement constraints before they are removed.
ALTER TABLE agent.jobs DROP CONSTRAINT IF EXISTS jobs_agent_key_check;
ALTER TABLE agent.artifacts DROP CONSTRAINT IF EXISTS artifacts_kind_check;
