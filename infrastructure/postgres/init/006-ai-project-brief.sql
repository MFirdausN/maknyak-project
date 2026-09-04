CREATE SCHEMA IF NOT EXISTS ai;

CREATE TABLE ai.models (
  id text PRIMARY KEY,
  provider text NOT NULL,
  provider_model text NOT NULL,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ai.models (id, provider, provider_model, display_name)
VALUES
  ('brief-local-v1', 'deterministic', 'brief-local-v1', 'Local deterministic preview'),
  ('brief-ollama-v1', 'ollama', 'qwen3:4b', 'Qwen 3 4B via Ollama')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE ai.prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  template text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, version)
);

CREATE UNIQUE INDEX ai_prompts_one_active_idx ON ai.prompts(key) WHERE active;

INSERT INTO ai.prompts (key, version, template, active)
VALUES (
  'project-brief',
  1,
  'Create a concise project brief as JSON with: summary, targetUsers, goals, inScope, outOfScope, risks, acceptanceCriteria, nextSteps. Use the same language as the input.',
  true
)
ON CONFLICT (key, version) DO NOTHING;

CREATE TABLE ai.briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  idea text NOT NULL CHECK (char_length(idea) BETWEEN 20 AND 8000),
  model_id text NOT NULL REFERENCES ai.models(id),
  prompt_id uuid NOT NULL REFERENCES ai.prompts(id),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_briefs_workspace_time_idx
  ON ai.briefs(workspace_id, created_at DESC, id DESC);

CREATE TABLE ai.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  model_id text NOT NULL REFERENCES ai.models(id),
  prompt_id uuid NOT NULL REFERENCES ai.prompts(id),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  input_characters integer NOT NULL,
  output_characters integer NOT NULL DEFAULT 0,
  latency_ms integer,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX ai_runs_workspace_time_idx
  ON ai.runs(workspace_id, created_at DESC);
