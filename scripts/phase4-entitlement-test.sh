#!/usr/bin/env bash
set -euo pipefail
compose_port() { docker compose port "$1" "$2" | awk -F: 'END { print $NF }'; }
json_field() { node -e 'let i="";process.stdin.on("data",c=>i+=c);process.stdin.on("end",()=>{let v=JSON.parse(i);for(const k of process.argv[1].split("."))v=v?.[k];if(v!=null)process.stdout.write(String(v))})' "$1"; }
gateway_port="$(compose_port gateway 3000)"; keycloak_port="$(compose_port keycloak 8080)"
token="$(curl --fail --silent --show-error -X POST "http://localhost:${keycloak_port}/realms/maknyak/protocol/openid-connect/token" -H 'content-type: application/x-www-form-urlencoded' --data-urlencode 'client_id=maknyak-cli' --data-urlencode 'username=developer' --data-urlencode 'password=maknyak-dev' --data-urlencode 'grant_type=password' | json_field access_token)"
call() { local method="$1" path="$2" body="${3:-}"; local args=(--silent --show-error -X "$method" -H "authorization: Bearer ${token}" -H 'content-type: application/json'); [[ -z "$body" ]] || args+=(--data "$body"); curl "${args[@]}" "http://localhost:${gateway_port}/api/v1${path}"; }
suffix="$(date +%s)-${RANDOM}"; workspace_id="$(call POST /workspaces "{\"slug\":\"entitlement-${suffix}\",\"name\":\"Entitlement Test\"}" | json_field id)"
entitlement="$(call GET "/workspaces/${workspace_id}/entitlements")"
[[ "$entitlement" == *'"planKey":"free"'* && "$entitlement" == *'"dailyAgentJobLimit":25'* ]] || { echo "unexpected entitlement: ${entitlement}" >&2; exit 1; }
ids=(); for index in {1..25}; do ids+=("$(call POST /ai/agent-jobs "{\"workspaceId\":\"${workspace_id}\",\"goal\":\"Entitlement boundary validation job number ${index} with sufficient detail.\"}" | json_field id)"); done
status="$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST -H "authorization: Bearer ${token}" -H 'content-type: application/json' --data "{\"workspaceId\":\"${workspace_id}\",\"goal\":\"This twenty sixth job must be rejected by server-side entitlement enforcement.\"}" "http://localhost:${gateway_port}/api/v1/ai/agent-jobs")"
[[ "$status" == "429" ]] || { echo "expected 429 at entitlement boundary, got ${status}" >&2; exit 1; }
for id in "${ids[@]}"; do call POST "/ai/agent-jobs/${id}/cancel" '{}' >/dev/null || true; done
echo "ok: free entitlement is visible and daily agent limit is enforced at 25 jobs"
