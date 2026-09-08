#!/usr/bin/env bash
set -euo pipefail
compose_port() { docker compose port "$1" "$2" | awk -F: 'END { print $NF }'; }
json_field() { node -e 'let i="";process.stdin.on("data",c=>i+=c);process.stdin.on("end",()=>{let v=JSON.parse(i);for(const k of process.argv[1].split("."))v=v?.[k];if(v!=null)process.stdout.write(String(v))})' "$1"; }
gateway_port="$(compose_port gateway 3000)"; keycloak_port="$(compose_port keycloak 8080)"; workspace_port="$(compose_port workspace 3002)"
token="$(curl --fail --silent --show-error -X POST "http://localhost:${keycloak_port}/realms/maknyak/protocol/openid-connect/token" -H 'content-type: application/x-www-form-urlencoded' --data-urlencode 'client_id=maknyak-cli' --data-urlencode 'username=developer' --data-urlencode 'password=maknyak-dev' --data-urlencode 'grant_type=password' | json_field access_token)"
collaborator_token="$(curl --fail --silent --show-error -X POST "http://localhost:${keycloak_port}/realms/maknyak/protocol/openid-connect/token" -H 'content-type: application/x-www-form-urlencoded' --data-urlencode 'client_id=maknyak-cli' --data-urlencode 'username=collaborator' --data-urlencode 'password=maknyak-collaborator' --data-urlencode 'grant_type=password' | json_field access_token)"
collaborator_id="$(node -e 'process.stdout.write(JSON.parse(Buffer.from(process.argv[1].split(".")[1],"base64url")).sub)' "$collaborator_token")"
call() { local method="$1" path="$2" body="${3:-}"; local args=(--silent --show-error -X "$method" -H "authorization: Bearer ${token}" -H 'content-type: application/json'); [[ -z "$body" ]] || args+=(--data "$body"); curl "${args[@]}" "http://localhost:${gateway_port}/api/v1${path}"; }
suffix="$(date +%s)-${RANDOM}"; workspace_id="$(call POST /workspaces "{\"slug\":\"entitlement-${suffix}\",\"name\":\"Entitlement Test\"}" | json_field id)"
entitlement="$(call GET "/workspaces/${workspace_id}/entitlements")"
[[ "$entitlement" == *'"planKey":"free"'* && "$entitlement" == *'"dailyAgentJobLimit":25'* ]] || { echo "unexpected entitlement: ${entitlement}" >&2; exit 1; }
ids=(); for index in {1..25}; do ids+=("$(call POST /ai/agent-jobs "{\"workspaceId\":\"${workspace_id}\",\"goal\":\"Entitlement boundary validation job number ${index} with sufficient detail.\"}" | json_field id)"); done
status="$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST -H "authorization: Bearer ${token}" -H 'content-type: application/json' --data "{\"workspaceId\":\"${workspace_id}\",\"goal\":\"This twenty sixth job must be rejected by server-side entitlement enforcement.\"}" "http://localhost:${gateway_port}/api/v1/ai/agent-jobs")"
[[ "$status" == "429" ]] || { echo "expected 429 at entitlement boundary, got ${status}" >&2; exit 1; }
usage="$(docker compose exec -T postgres psql --tuples-only --no-align -U "${POSTGRES_USER:-maknyak}" -d "${POSTGRES_DB:-maknyak}" -c "SELECT count(*) FROM agent.usage_events WHERE workspace_id = '${workspace_id}';")"
[[ "$usage" == "25" ]] || { echo "expected 25 transactional usage events, got ${usage}" >&2; exit 1; }
for suffix_id in 2 3 4 5; do call POST "/workspaces/${workspace_id}/members" "{\"principalId\":\"00000000-0000-4000-8000-00000000000${suffix_id}\",\"role\":\"member\"}" >/dev/null; done
member_status="$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST -H "authorization: Bearer ${token}" -H 'content-type: application/json' --data '{"principalId":"00000000-0000-4000-8000-000000000006","role":"member"}' "http://localhost:${gateway_port}/api/v1/workspaces/${workspace_id}/members")"
[[ "$member_status" == "409" ]] || { echo "expected member limit conflict, got ${member_status}" >&2; exit 1; }
call POST "/workspaces/${workspace_id}/subscription-changes" '{"planKey":"team"}' >/dev/null
pending="$(call GET "/workspaces/${workspace_id}/entitlements")"
[[ "$pending" == *'"planKey":"free"'* && "$pending" == *'"pendingPlanKey":"team"'* ]] || { echo "subscription request changed entitlement prematurely: ${pending}" >&2; exit 1; }
event_id="phase4-${suffix}"; occurred_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
billing_body="{\"provider\":\"test-provider\",\"eventId\":\"${event_id}\",\"type\":\"subscription.activated\",\"workspaceId\":\"${workspace_id}\",\"planKey\":\"team\",\"occurredAt\":\"${occurred_at}\"}"
invalid_status="$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST -H 'content-type: application/json' -H 'x-billing-signature: sha256=00' --data "$billing_body" "http://localhost:${workspace_port}/api/v1/internal/billing/events")"
[[ "$invalid_status" == "401" ]] || { echo "invalid billing signature was accepted: ${invalid_status}" >&2; exit 1; }
billing_secret="$(docker compose exec -T workspace printenv BILLING_WEBHOOK_SECRET)"
signature="$(node -e 'const {createHmac}=require("node:crypto");process.stdout.write(createHmac("sha256",process.argv[1]).update(process.argv.slice(2).join("\n")).digest("hex"))' "$billing_secret" test-provider "$event_id" subscription.activated "$workspace_id" team "$occurred_at")"
activation="$(curl --fail-with-body --silent --show-error -X POST -H 'content-type: application/json' -H "x-billing-signature: sha256=${signature}" --data "$billing_body" "http://localhost:${workspace_port}/api/v1/internal/billing/events")"
[[ "$activation" == *'"status":"applied"'* ]] || { echo "billing activation failed: ${activation}" >&2; exit 1; }
duplicate="$(curl --fail-with-body --silent --show-error -X POST -H 'content-type: application/json' -H "x-billing-signature: sha256=${signature}" --data "$billing_body" "http://localhost:${workspace_port}/api/v1/internal/billing/events")"
[[ "$duplicate" == *'"status":"duplicate"'* ]] || { echo "billing event was not idempotent: ${duplicate}" >&2; exit 1; }
billing_records="$(docker compose exec -T postgres psql --tuples-only --no-align -U "${POSTGRES_USER:-maknyak}" -d "${POSTGRES_DB:-maknyak}" -c "SELECT (SELECT count(*) FROM workspace.billing_events WHERE provider = 'test-provider' AND event_id = '${event_id}') || ':' || (SELECT count(*) FROM audit.events WHERE workspace_id = '${workspace_id}' AND action = 'subscription.activated') || ':' || (SELECT count(*) FROM workspace.outbox WHERE aggregate_id = '${workspace_id}' AND subject = 'workspace.subscription.activated.v1');")"
[[ "$billing_records" == "1:1:1" ]] || { echo "billing activation audit/outbox records are incomplete: ${billing_records}" >&2; exit 1; }
active="$(call GET "/workspaces/${workspace_id}/entitlements")"
[[ "$active" == *'"planKey":"team"'* && "$active" == *'"dailyAgentJobLimit":500'* && "$active" == *'"pendingPlanKey":null'* ]] || { echo "Team entitlement was not activated: ${active}" >&2; exit 1; }
post_upgrade_id="$(call POST /ai/agent-jobs "{\"workspaceId\":\"${workspace_id}\",\"goal\":\"This job verifies the upgraded Team usage boundary is active.\"}" | json_field id)"
usage_summary="$(call GET "/ai/usage?workspaceId=${workspace_id}")"
[[ "$usage_summary" == *'"agentJobsToday":26'* && "$usage_summary" == *'"dailyAgentJobLimit":500'* && "$usage_summary" == *'"agentJobsRemaining":474'* ]] || { echo "commercial usage summary is incorrect: ${usage_summary}" >&2; exit 1; }
sixth_member_status="$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST -H "authorization: Bearer ${token}" -H 'content-type: application/json' --data "{\"principalId\":\"${collaborator_id}\",\"role\":\"member\"}" "http://localhost:${gateway_port}/api/v1/workspaces/${workspace_id}/members")"
[[ "$sixth_member_status" == "204" ]] || { echo "failed to add sixth Team member: ${sixth_member_status}" >&2; exit 1; }
downgrade_blocked="$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST -H "authorization: Bearer ${token}" -H 'content-type: application/json' --data '{"planKey":"free"}' "http://localhost:${gateway_port}/api/v1/workspaces/${workspace_id}/subscription-changes")"
[[ "$downgrade_blocked" == "409" ]] || { echo "unsafe downgrade was not blocked: ${downgrade_blocked}" >&2; exit 1; }
member_history_status="$(curl --silent --output /dev/null --write-out '%{http_code}' -H "authorization: Bearer ${collaborator_token}" "http://localhost:${gateway_port}/api/v1/workspaces/${workspace_id}/subscription-changes?page=1")"
[[ "$member_history_status" == "403" ]] || { echo "non-owner accessed billing history: ${member_history_status}" >&2; exit 1; }
call DELETE "/workspaces/${workspace_id}/members/${collaborator_id}" >/dev/null
call POST "/workspaces/${workspace_id}/subscription-changes" '{"planKey":"free"}' >/dev/null
cancel_event_id="phase4-cancel-${suffix}"; cancel_occurred_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cancel_body="{\"provider\":\"test-provider\",\"eventId\":\"${cancel_event_id}\",\"type\":\"subscription.cancelled\",\"workspaceId\":\"${workspace_id}\",\"planKey\":\"free\",\"occurredAt\":\"${cancel_occurred_at}\"}"
cancel_signature="$(node -e 'const {createHmac}=require("node:crypto");process.stdout.write(createHmac("sha256",process.argv[1]).update(process.argv.slice(2).join("\n")).digest("hex"))' "$billing_secret" test-provider "$cancel_event_id" subscription.cancelled "$workspace_id" free "$cancel_occurred_at")"
cancellation="$(curl --fail-with-body --silent --show-error -X POST -H 'content-type: application/json' -H "x-billing-signature: sha256=${cancel_signature}" --data "$cancel_body" "http://localhost:${workspace_port}/api/v1/internal/billing/events")"
[[ "$cancellation" == *'"status":"applied"'* ]] || { echo "billing cancellation failed: ${cancellation}" >&2; exit 1; }
downgraded="$(call GET "/workspaces/${workspace_id}/entitlements")"
[[ "$downgraded" == *'"planKey":"free"'* && "$downgraded" == *'"dailyAgentJobLimit":25'* && "$downgraded" == *'"pendingPlanKey":null'* ]] || { echo "Free entitlement was not restored: ${downgraded}" >&2; exit 1; }
history="$(call GET "/workspaces/${workspace_id}/subscription-changes?page=1")"
[[ "$history" == *'"total":2'* && "$history" == *'"pageSize":10'* && "$history" == *'"provider":"test-provider"'* ]] || { echo "billing history is incomplete: ${history}" >&2; exit 1; }
blocked_again="$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST -H "authorization: Bearer ${token}" -H 'content-type: application/json' --data "{\"workspaceId\":\"${workspace_id}\",\"goal\":\"The restored Free plan must reject this job above its daily limit.\"}" "http://localhost:${gateway_port}/api/v1/ai/agent-jobs")"
[[ "$blocked_again" == "429" ]] || { echo "restored Free limit was not enforced: ${blocked_again}" >&2; exit 1; }
for id in "${ids[@]}"; do call POST "/ai/agent-jobs/${id}/cancel" '{}' >/dev/null || true; done
call POST "/ai/agent-jobs/${post_upgrade_id}/cancel" '{}' >/dev/null || true
echo "ok: signed activation/cancellation safely transitions enforced commercial entitlements"
