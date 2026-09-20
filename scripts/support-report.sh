#!/usr/bin/env bash
set -euo pipefail

workspace_ref="${SUPPORT_WORKSPACE:-}"
operator_id="${SUPPORT_OPERATOR_ID:-}"
reason="${SUPPORT_REASON:-}"

[[ "$workspace_ref" =~ ^[a-zA-Z0-9-]{2,100}$ ]] || {
  echo "SUPPORT_WORKSPACE must be a workspace UUID or slug" >&2
  exit 2
}
[[ "$operator_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] || {
  echo "SUPPORT_OPERATOR_ID must be a valid principal UUID" >&2
  exit 2
}
(( ${#reason} >= 10 && ${#reason} <= 500 )) || {
  echo "SUPPORT_REASON must contain 10 to 500 characters" >&2
  exit 2
}

docker compose exec -T \
  -e "SUPPORT_WORKSPACE=${workspace_ref}" \
  -e "SUPPORT_OPERATOR_ID=${operator_id}" \
  -e "SUPPORT_REASON=${reason}" \
  postgres sh -ceu '
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      --set=workspace_ref="$SUPPORT_WORKSPACE" \
      --set=operator_id="$SUPPORT_OPERATOR_ID" \
      --set=reason="$SUPPORT_REASON"
  ' <<'SQL'
\set ON_ERROR_STOP on
\pset border 1
\pset null '-'
BEGIN;

SELECT id AS operator_id
FROM identity.principals
WHERE id = :'operator_id'::uuid
\gset operator_

SELECT id AS workspace_id, slug AS workspace_slug
FROM workspace.workspaces
WHERE id::text = :'workspace_ref' OR slug = :'workspace_ref'
\gset target_

INSERT INTO audit.events
  (workspace_id, principal_id, action, entity_type, entity_id, metadata)
VALUES
  (:'target_workspace_id'::uuid, :'operator_operator_id'::uuid,
   'support.workspace.inspected', 'workspace', :'target_workspace_id'::uuid,
   jsonb_build_object('reason', :'reason', 'interface', 'support-report-v1'));

COMMIT;

\echo 'Workspace'
SELECT w.id, w.slug, w.name, w.created_at,
  e.plan_key, e.status AS entitlement_status, p.member_limit,
  p.daily_agent_job_limit, p.retention_days
FROM workspace.workspaces w
JOIN workspace.entitlements e ON e.workspace_id = w.id
JOIN workspace.plan_catalog p ON p.plan_key = e.plan_key
WHERE w.id = :'target_workspace_id'::uuid;

\echo 'Membership and project counts'
SELECT
  (SELECT count(*) FROM workspace.memberships WHERE workspace_id = :'target_workspace_id') AS members,
  (SELECT count(*) FROM workspace.memberships WHERE workspace_id = :'target_workspace_id' AND role = 'owner') AS owners,
  (SELECT count(*) FROM workspace.projects WHERE workspace_id = :'target_workspace_id') AS projects;

\echo 'Invitation status (no email or token data)'
SELECT status, count(*)
FROM workspace.invitations
WHERE workspace_id = :'target_workspace_id'
GROUP BY status ORDER BY status;

\echo 'AI usage today (UTC)'
SELECT
  count(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS runs,
  COALESCE(sum(input_tokens + output_tokens) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS tokens,
  COALESCE(sum(cost_microusd) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS cost_microusd,
  count(*) FILTER (WHERE status = 'failed' AND created_at >= date_trunc('day', now())) AS failed_runs
FROM ai.runs WHERE workspace_id = :'target_workspace_id';

\echo 'Agent job status'
SELECT status, count(*)
FROM agent.jobs
WHERE workspace_id = :'target_workspace_id'
GROUP BY status ORDER BY status;

\echo 'Billing state'
SELECT status, count(*)
FROM workspace.subscription_changes
WHERE workspace_id = :'target_workspace_id'
GROUP BY status ORDER BY status;

\echo 'Delivery backlog'
SELECT count(*) AS unpublished_outbox_events
FROM workspace.outbox
WHERE aggregate_id = :'target_workspace_id'::uuid AND published_at IS NULL;

\echo 'Recent audit actions (metadata intentionally omitted)'
SELECT action, entity_type, occurred_at
FROM audit.events
WHERE workspace_id = :'target_workspace_id'
ORDER BY occurred_at DESC, id DESC LIMIT 10;
SQL
