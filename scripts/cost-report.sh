#!/usr/bin/env bash
set -euo pipefail

report_limit="${COST_REPORT_LIMIT:-20}"
[[ "$report_limit" =~ ^[1-9][0-9]*$ && "$report_limit" -le 1000 ]] || {
  echo "COST_REPORT_LIMIT must be between 1 and 1000" >&2
  exit 2
}

echo "Tenant daily usage (UTC)"
docker compose exec -T -e "REPORT_LIMIT=${report_limit}" postgres sh -ceu '
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --pset border=1 --pset null="-" --command "
    WITH report AS (SELECT w.slug AS workspace,
      e.plan_key AS plan,
      COALESCE((SELECT sum(input_tokens + output_tokens) FROM ai.runs r
        WHERE r.workspace_id = w.id AND r.created_at >= date_trunc('\''day'\'', now())), 0)
      + COALESCE((SELECT sum(input_tokens + output_tokens) FROM ai.messages m
        WHERE m.workspace_id = w.id AND m.created_at >= date_trunc('\''day'\'', now())), 0) AS tokens,
      COALESCE(l.daily_token_limit, 100000) AS token_limit,
      COALESCE((SELECT sum(cost_microusd) FROM ai.runs r
        WHERE r.workspace_id = w.id AND r.created_at >= date_trunc('\''day'\'', now())), 0)
      + COALESCE((SELECT sum(cost_microusd) FROM ai.messages m
        WHERE m.workspace_id = w.id AND m.created_at >= date_trunc('\''day'\'', now())), 0) AS cost_microusd,
      COALESCE(l.daily_cost_microusd, 1000000) AS cost_limit_microusd,
      COALESCE((SELECT sum(quantity) FROM agent.usage_events u
        WHERE u.workspace_id = w.id AND u.occurred_at >= date_trunc('\''day'\'', now())), 0) AS agent_jobs,
      p.daily_agent_job_limit AS agent_job_limit
    FROM workspace.workspaces w
    JOIN workspace.entitlements e ON e.workspace_id = w.id
    JOIN workspace.plan_catalog p ON p.plan_key = e.plan_key
    LEFT JOIN ai.workspace_limits l ON l.workspace_id = w.id
    )
    SELECT * FROM report
    ORDER BY agent_jobs::numeric / NULLIF(agent_job_limit, 0) DESC,
      cost_microusd::numeric / NULLIF(cost_limit_microusd, 0) DESC,
      tokens::numeric / NULLIF(token_limit, 0) DESC,
      workspace
    LIMIT $REPORT_LIMIT"
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --tuples-only --no-align \
    --command "SELECT '\''Total workspaces: '\'' || count(*) FROM workspace.workspaces"
'

echo
echo "Durable storage"
docker compose exec -T postgres sh -ceu '
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --tuples-only --no-align \
    --command "SELECT '\''PostgreSQL: '\'' || pg_size_pretty(pg_database_size(current_database()))"
'
docker compose exec -T minio sh -ceu '
  mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  mc du "local/${AGENT_ARTIFACT_BUCKET:-maknyak-agent-artifacts}"
'

echo
echo "Live container resources"
mapfile -t container_ids < <(docker compose ps --status running -q)
if (( ${#container_ids[@]} == 0 )); then
  echo "No running Compose containers." >&2
  exit 1
fi
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}' "${container_ids[@]}"
