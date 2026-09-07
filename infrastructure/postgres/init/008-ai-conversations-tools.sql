ALTER TABLE ai.runs
  ADD COLUMN input_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN output_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN cost_microusd bigint NOT NULL DEFAULT 0,
  ADD COLUMN trace_id text;

ALTER TABLE ai.workspace_limits
  ADD COLUMN daily_token_limit integer NOT NULL DEFAULT 100000 CHECK (daily_token_limit BETWEEN 1000 AND 100000000),
  ADD COLUMN daily_cost_microusd bigint NOT NULL DEFAULT 1000000 CHECK (daily_cost_microusd BETWEEN 0 AND 100000000000);

CREATE TABLE ai.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX ai_conversations_workspace_time_idx
  ON ai.conversations(workspace_id, updated_at DESC, id DESC);
CREATE INDEX ai_conversations_expiry_idx ON ai.conversations(expires_at);

CREATE TABLE ai.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai.conversations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 12000),
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_microusd bigint NOT NULL DEFAULT 0,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_messages_conversation_time_idx
  ON ai.messages(conversation_id, created_at, id);

CREATE TABLE ai.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 80),
  value text NOT NULL CHECK (char_length(value) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (workspace_id, principal_id, key)
);

CREATE INDEX ai_memories_expiry_idx ON ai.memories(expires_at);

CREATE TABLE ai.tool_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  conversation_id uuid REFERENCES ai.conversations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  tool_name text NOT NULL CHECK (tool_name IN ('conversation.stats', 'memory.list')),
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'succeeded', 'failed')),
  approved_by uuid,
  output jsonb,
  error_code text,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  executed_at timestamptz,
  expires_at timestamptz NOT NULL
);

CREATE INDEX ai_tool_requests_workspace_time_idx
  ON ai.tool_requests(workspace_id, created_at DESC, id DESC);
CREATE INDEX ai_tool_requests_expiry_idx ON ai.tool_requests(expires_at);

