# Privileged support

Status: audited local/preview baseline. There is no public admin endpoint and no
user impersonation capability.

## Security boundary

The support report requires Docker/database access, which is already equivalent
to privileged host access. Only designated operators may run it. Every access
requires an existing Identity principal UUID and a reason, and writes an
append-only `support.workspace.inspected` audit event before returning data.

The report is deliberately read-only after that audit insertion. It exposes
workspace metadata and aggregate operational state only. It does not output
invitation email addresses, invitation/payment tokens, prompts, conversation or
memory content, agent goals, artifact content, credentials, or audit metadata.

## Usage

Find your operator principal UUID from your authenticated profile or the local
Identity record, then run:

```bash
make support-report \
  WORKSPACE=maknyak-core \
  SUPPORT_OPERATOR_ID=<principal-uuid> \
  SUPPORT_REASON='Investigating customer-reported queue delay'
```

The workspace may be identified by UUID or slug. Reasons must contain 10–500
characters and must not include credentials or customer content.

Use the output to establish entitlement state, counts, daily AI usage, agent
status, billing state, unpublished outbox events, and recent audit action names.
Correlate with request/trace IDs and follow [OPERATIONS.md](OPERATIONS.md) for an
incident.

## Forbidden operations

- Do not query customer content casually or copy production data locally.
- Do not edit subscriptions, memberships, usage ledgers, or audit events with
  SQL.
- Do not impersonate a user or ask for their password/token.
- Do not delete evidence during an incident.
- Do not create broad remediation commands. Each future mutation needs a narrow
  contract, explicit approval, idempotency, audit, and rollback procedure.

Production still requires separate support IAM, short-lived database access,
approval for sensitive cases, centralized audit export, access review, and
tested narrowly scoped remediation workflows.
