#!/usr/bin/env bash
set -euo pipefail

compose_port() { docker compose port "$1" "$2" | awk -F: 'END { print $NF }'; }
json_field() {
  node -e 'let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => { const value = JSON.parse(input)[process.argv[1]]; if (value !== undefined && value !== null) process.stdout.write(String(value)); });' "$1"
}
oidc_token() {
  curl --fail --silent --show-error --request POST "http://localhost:${keycloak_port}/realms/maknyak/protocol/openid-connect/token" \
    --header "content-type: application/x-www-form-urlencoded" \
    --data-urlencode "client_id=maknyak-cli" --data-urlencode "username=$1" \
    --data-urlencode "password=$2" --data-urlencode "grant_type=password" | json_field access_token
}
request() {
  local token="$1" method="$2" path="$3" body="${4:-}"
  local args=(--silent --show-error --request "$method" --header "authorization: Bearer ${token}" --header "x-request-id: phase2-brief-test")
  [[ -z "$body" ]] || args+=(--header "content-type: application/json" --data "$body")
  curl "${args[@]}" "http://localhost:${gateway_port}/api/v1${path}"
}
status() {
  local token="$1" method="$2" path="$3" body="${4:-}"
  local args=(--silent --output /dev/null --write-out '%{http_code}' --request "$method" --header "authorization: Bearer ${token}")
  [[ -z "$body" ]] || args+=(--header "content-type: application/json" --data "$body")
  curl "${args[@]}" "http://localhost:${gateway_port}/api/v1${path}"
}

gateway_port="$(compose_port gateway 3000)"
keycloak_port="$(compose_port keycloak 8080)"
dashboard_port="$(compose_port dashboard 3003)"
owner_token="$(oidc_token developer maknyak-dev)"
outsider_token="$(oidc_token collaborator maknyak-collaborator)"
suffix="$(date +%s)-${RANDOM}"
workspace="$(request "$owner_token" POST /workspaces "{\"slug\":\"ai-brief-${suffix}\",\"name\":\"AI Brief Test\"}")"
workspace_id="$(json_field id <<<"$workspace")"

models="$(request "$owner_token" GET /ai/models)"
[[ "$models" == *'brief-local-v1'* ]] || { echo "deterministic model unavailable" >&2; exit 1; }
echo "ok: authenticated model registry is available"

dashboard_models="$(curl --fail --silent --show-error --cookie "maknyak_access=${owner_token}" "http://localhost:${dashboard_port}/api/ai/models")"
[[ "$dashboard_models" == *'brief-local-v1'* ]] || { echo "dashboard AI BFF did not preserve the authenticated session" >&2; exit 1; }
echo "ok: dashboard AI BFF uses the HttpOnly-compatible session boundary"

payload="{\"workspaceId\":\"${workspace_id}\",\"title\":\"Onboarding Assistant\",\"idea\":\"Help a small product team turn raw onboarding notes into a measurable execution plan.\",\"modelId\":\"brief-local-v1\"}"
stream="$(request "$owner_token" POST /ai/briefs/stream "$payload")"
[[ "$stream" == *'event: token'* && "$stream" == *'event: result'* ]] || { echo "AI stream did not contain token and result events" >&2; exit 1; }
echo "ok: project brief generation streams and completes"

page="$(request "$owner_token" GET "/ai/briefs?workspaceId=${workspace_id}&page=1")"
[[ "$(json_field total <<<"$page")" == "1" && "$(json_field pageSize <<<"$page")" == "10" ]] || { echo "brief pagination contract failed: ${page}" >&2; exit 1; }
echo "ok: brief history uses tenant-scoped pagination of 10"

[[ "$(status "$outsider_token" GET "/ai/briefs?workspaceId=${workspace_id}&page=1")" == "403" ]] || {
  echo "unrelated principal accessed tenant AI briefs" >&2
  exit 1
}
echo "ok: unrelated principal cannot access tenant AI data"

run_count="$(docker compose exec -T postgres psql --tuples-only --no-align -U "${POSTGRES_USER:-maknyak}" -d "${POSTGRES_DB:-maknyak}" --command "SELECT count(*) FROM ai.runs WHERE workspace_id = '${workspace_id}' AND status = 'succeeded' AND latency_ms IS NOT NULL;")"
[[ "$run_count" == "1" ]] || { echo "AI usage run was not recorded" >&2; exit 1; }
echo "ok: AI run usage and latency are recorded"
