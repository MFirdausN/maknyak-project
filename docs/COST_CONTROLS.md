# Cost and capacity controls

Status: local/preview baseline. Cloud-provider budgets and paid AI pricing remain
deployment/vendor decisions.

## Enforced boundaries

- AI generation is limited per workspace by daily run count, concurrent runs,
  daily tokens, and daily cost in micro-US dollars.
- Conversation messages share the workspace token ledger.
- Agent jobs use a transactional, idempotent usage ledger and plan entitlement.
- Retention windows bound PostgreSQL and object-storage growth.
- Compose services have explicit memory and CPU ceilings. Every ceiling can be
  overridden by its environment variable after load testing.
- Payment remains disabled; no external provider can create charges.

Run the operational report against the active stack:

```bash
make cost-report
```

The report contains workspace usage versus limits, PostgreSQL and MinIO size,
and live CPU/memory/network usage for Compose containers. It is intentionally
read-only and does not expose prompts, artifact contents, tokens, or secrets.
It shows the 20 highest-usage workspaces by default; set `COST_REPORT_LIMIT` to
change that bounded result size.

## Review policy

Review the report weekly in preview and daily after production traffic begins.
Investigate a workspace above 80% of any daily limit, sustained container memory
above 80%, unexpected storage growth, or provider cost without corresponding
metered usage. Raising a limit requires an owner and a reason; do not respond to
capacity pressure by silently removing a guard.

Before enabling a paid provider, its adapter must report actual token and cost
usage, define a conservative pre-request cost estimate, reject requests that
could exceed the workspace budget, and reconcile provider invoices against the
internal ledger. Midtrans activation is a separate payment decision.

Production still requires cloud billing alerts, environment-level monthly
budgets, egress monitoring, storage lifecycle policy, and cost attribution by
product/workspace. Resource ceilings are safety boundaries, not sizing evidence;
load testing determines production requests and limits.
