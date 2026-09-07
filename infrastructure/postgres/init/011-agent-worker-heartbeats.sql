CREATE TABLE agent.worker_heartbeats (
  worker_id text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  processed_jobs bigint NOT NULL DEFAULT 0 CHECK (processed_jobs >= 0)
);

CREATE INDEX agent_worker_heartbeats_time_idx
  ON agent.worker_heartbeats(heartbeat_at DESC);
