#!/usr/bin/env bash
set -euo pipefail

jobs="${PHASE3_LOAD_JOBS:-20}"
[[ "$jobs" =~ ^[1-9][0-9]*$ && "$jobs" -le 100 ]] || { echo "PHASE3_LOAD_JOBS must be between 1 and 100" >&2; exit 1; }
compose_port() { docker compose port "$1" "$2" | awk -F: 'END { print $NF }'; }
json_field() { node -e 'let i="";process.stdin.on("data",c=>i+=c);process.stdin.on("end",()=>{let v=JSON.parse(i);for(const k of process.argv[1].split("."))v=v?.[k];if(v!=null)process.stdout.write(String(v))})' "$1"; }
gateway_port="$(compose_port gateway 3000)"; keycloak_port="$(compose_port keycloak 8080)"
token="$(curl --fail --silent --show-error -X POST "http://localhost:${keycloak_port}/realms/maknyak/protocol/openid-connect/token" -H 'content-type: application/x-www-form-urlencoded' --data-urlencode 'client_id=maknyak-cli' --data-urlencode 'username=developer' --data-urlencode 'password=maknyak-dev' --data-urlencode 'grant_type=password' | json_field access_token)"
request() {
  local method="$1" path="$2" body="${3:-}"
  local args=(--fail --silent --show-error -X "$method" -H "authorization: Bearer ${token}" -H 'content-type: application/json')
  [[ -z "$body" ]] || args+=(--data "$body")
  curl "${args[@]}" "http://localhost:${gateway_port}/api/v1${path}"
}
suffix="$(date +%s)-${RANDOM}"
workspace_id="$(request POST /workspaces "{\"slug\":\"agent-load-${suffix}\",\"name\":\"Agent Load Test\"}" | json_field id)"
ids=()
started="$(date +%s)"
for index in $(seq 1 "$jobs"); do
  ids+=("$(request POST /ai/agent-jobs "{\"workspaceId\":\"${workspace_id}\",\"goal\":\"Concurrent queue validation job ${index} with deterministic acceptance criteria.\"}" | json_field id)")
done
deadline=$((started + 60))
while (( $(date +%s) < deadline )); do
  awaiting="$(docker compose exec -T postgres psql --tuples-only --no-align -U "${POSTGRES_USER:-maknyak}" -d "${POSTGRES_DB:-maknyak}" -c "SELECT count(*) FROM agent.jobs WHERE workspace_id = '${workspace_id}' AND status = 'awaiting_approval';")"
  [[ "$awaiting" == "$jobs" ]] && break
  sleep 1
done
[[ "${awaiting:-0}" == "$jobs" ]] || { echo "only ${awaiting:-0}/${jobs} jobs reached approval within 60s" >&2; exit 1; }
duplicates="$(docker compose exec -T postgres psql --tuples-only --no-align -U "${POSTGRES_USER:-maknyak}" -d "${POSTGRES_DB:-maknyak}" -c "SELECT count(*) FROM (SELECT job_id FROM agent.steps WHERE workspace_id = '${workspace_id}' GROUP BY job_id HAVING count(*) <> 1) duplicate;")"
[[ "$duplicates" == "0" ]] || { echo "${duplicates} jobs were processed more than once" >&2; exit 1; }
elapsed=$(( $(date +%s) - started ))
workers="$(request GET "/ai/agent-jobs/operations?workspaceId=${workspace_id}" | json_field activeWorkers)"
for id in "${ids[@]}"; do request POST "/ai/agent-jobs/${id}/cancel" '{}' >/dev/null; done
echo "ok: ${jobs} concurrent jobs reached approval exactly once in ${elapsed}s using ${workers} active worker(s)"
