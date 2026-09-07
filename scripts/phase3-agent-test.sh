#!/usr/bin/env bash
set -euo pipefail

compose_port() { docker compose port "$1" "$2" | awk -F: 'END { print $NF }'; }
json_field() { node -e 'let i="";process.stdin.on("data",c=>i+=c);process.stdin.on("end",()=>{const p=process.argv[1].split(".");let v=JSON.parse(i);for(const k of p)v=v?.[k];if(v!=null)process.stdout.write(String(v))})' "$1"; }
oidc_token() { curl --fail --silent --show-error -X POST "http://localhost:${keycloak_port}/realms/maknyak/protocol/openid-connect/token" -H 'content-type: application/x-www-form-urlencoded' --data-urlencode 'client_id=maknyak-cli' --data-urlencode "username=$1" --data-urlencode "password=$2" --data-urlencode 'grant_type=password' | json_field access_token; }
request() { local token="$1" method="$2" path="$3" body="${4:-}"; local args=(--silent --show-error -X "$method" -H "authorization: Bearer ${token}" -H 'content-type: application/json' -H 'x-request-id: phase3-agent-test' -H 'traceparent: 00-33333333333333333333333333333333-4444444444444444-01'); [[ -z "$body" ]] || args+=(--data "$body"); curl "${args[@]}" "http://localhost:${gateway_port}/api/v1${path}"; }
status() { local token="$1" method="$2" path="$3"; curl --silent --output /dev/null --write-out '%{http_code}' -X "$method" -H "authorization: Bearer ${token}" "http://localhost:${gateway_port}/api/v1${path}"; }
wait_status() { local token="$1" job="$2" expected="$3"; for _ in {1..20}; do local payload current; payload="$(request "$token" GET "/ai/agent-jobs/${job}")"; current="$(json_field status <<<"$payload")"; [[ "$current" == "$expected" ]] && { printf '%s' "$payload"; return 0; }; sleep 1; done; echo "job ${job} did not reach ${expected}" >&2; return 1; }

gateway_port="$(compose_port gateway 3000)"; keycloak_port="$(compose_port keycloak 8080)"
owner_token="$(oidc_token developer maknyak-dev)"; outsider_token="$(oidc_token collaborator maknyak-collaborator)"
suffix="$(date +%s)-${RANDOM}"
workspace="$(request "$owner_token" POST /workspaces "{\"slug\":\"agent-${suffix}\",\"name\":\"Agent Runtime Test\"}")"
workspace_id="$(json_field id <<<"$workspace")"

created="$(request "$owner_token" POST /ai/agent-jobs "{\"workspaceId\":\"${workspace_id}\",\"agentKey\":\"project-planner-v1\",\"goal\":\"Create a measurable onboarding plan with explicit risks and milestones.\"}")"
job_id="$(json_field id <<<"$created")"
draft="$(wait_status "$owner_token" "$job_id" awaiting_approval)"
[[ "$draft" == *'"score":100'* ]] || { echo "agent evaluation missing: ${draft}" >&2; exit 1; }
echo "ok: durable worker creates an evaluated checkpoint"

[[ "$(status "$outsider_token" GET "/ai/agent-jobs/${job_id}")" == "403" ]] || { echo "outsider accessed tenant agent job" >&2; exit 1; }
echo "ok: agent job is tenant isolated"

request "$owner_token" POST "/ai/agent-jobs/${job_id}/approve" '{}' >/dev/null
completed="$(wait_status "$owner_token" "$job_id" succeeded)"
[[ "$completed" == *'"checksumSha256"'* && "$completed" == *'"publish-artifact"'* ]] || { echo "artifact or durable steps missing: ${completed}" >&2; exit 1; }
echo "ok: approval grants scoped capability and publishes checksummed artifact"

revoked="$(docker compose exec -T postgres psql --tuples-only --no-align -U "${POSTGRES_USER:-maknyak}" -d "${POSTGRES_DB:-maknyak}" -c "SELECT count(*) FROM agent.capability_grants WHERE job_id = '${job_id}' AND revoked_at IS NOT NULL;")"
[[ "$revoked" == "1" ]] || { echo "capability was not revoked after use" >&2; exit 1; }
echo "ok: one-time artifact capability is revoked"

trace="$(docker compose exec -T postgres psql --tuples-only --no-align -U "${POSTGRES_USER:-maknyak}" -d "${POSTGRES_DB:-maknyak}" -c "SELECT trace_id FROM agent.jobs WHERE id = '${job_id}';")"
[[ "$trace" == "33333333333333333333333333333333" ]] || { echo "agent trace context missing" >&2; exit 1; }
echo "ok: agent job preserves distributed trace context"
