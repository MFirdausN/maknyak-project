# Operations and incident response

Status: local/preview baseline. Targets must be revisited with real traffic
before production commitments are published.

## Service level indicators

The first user-visible boundaries are the Dashboard and Gateway. Identity,
Workspace, AI, Keycloak, PostgreSQL, Redis, NATS, and MinIO are dependencies
used to explain failures, not separate promises to customers.

Initial preview objectives measured per rolling 30 days:

| Indicator                                                             | Preview objective | Production candidate |
| --------------------------------------------------------------------- | ----------------: | -------------------: |
| Dashboard successful HTTP probes                                      |             99.5% |                99.9% |
| Gateway readiness and successful non-streaming API requests           |             99.5% |                99.9% |
| Non-streaming API p95 latency                                         |       <= 1,000 ms |            <= 750 ms |
| Accepted agent jobs reaching approval/terminal state within 5 minutes |               99% |                99.5% |
| Restore drill                                                         |           monthly |              monthly |

Provider generation time and human approval time are excluded from the
non-streaming API latency SLI and must be reported separately. Planned
maintenance is not automatically excluded: exclusions require a written change
record.

Run the bounded local probe with:

```bash
make slo-check
```

`SLO_SAMPLES`, `SLO_INTERVAL_SECONDS`, `SLO_MIN_AVAILABILITY_PERCENT`, and
`SLO_MAX_P95_MS` can adjust the sampling window. The script is a deployment and
CI probe, not a replacement for a production time-series backend.

## Alert policy

When a metrics backend is selected, alert on symptoms at the Gateway/Dashboard
boundary and use dependency signals for diagnosis. Page immediately for:

- suspected cross-tenant access or credential compromise;
- sustained user-visible unavailability;
- data loss/corruption or failed recovery;
- exhausted disk that threatens writes.

Create a non-paging ticket for latency degradation, queue backlog, backup age,
and cost anomalies that remain inside the error budget. Every alert needs an
owner, threshold, evaluation window, and runbook link. Alerts that never cause
action should be removed or changed.

## Severity

- **SEV-1:** tenant isolation/security breach, confirmed data loss, or most users
  cannot use the platform. Acknowledge within 15 minutes.
- **SEV-2:** major feature unavailable, billing entitlement incorrect, or agent
  queue is stuck with a workaround available. Acknowledge within 30 minutes.
- **SEV-3:** limited degradation or single-workspace issue. Handle in the normal
  engineering queue.

These are internal response objectives, not external contractual guarantees.

## First response

1. Declare severity, incident lead, start time, and affected boundaries.
2. Preserve evidence: request/trace IDs, timestamps, deployment revision, and
   relevant redacted logs. Never copy tokens or customer content into chat.
3. Check capacity and service state:

   ```bash
   df -h / /home
   docker compose ps
   make slo-check
   docker compose logs --since 15m gateway workspace ai agent-worker
   ```

4. Prefer a reversible mitigation: disable the affected integration, stop new
   jobs, scale a healthy worker, or roll back the last verified deployment.
5. For suspected tenant or credential compromise, disable the boundary, rotate
   affected secrets, preserve audit records, and do not perform broad cleanup.
6. For data recovery, follow [DATA_RECOVERY.md](DATA_RECOVERY.md) and restore to
   new targets. Never overwrite active storage during diagnosis.
7. Communicate status at least every 30 minutes for SEV-1 and every 60 minutes
   for SEV-2 until mitigated.

## Closure

Confirm user-visible recovery, monitor at least one evaluation window, and name
the person who closes the incident. Within three business days record impact,
timeline, contributing conditions, detection gaps, and owned follow-up actions.
The review is blameless, but actions require an owner and due date.

Production still requires a metrics backend, external probes, notification
routing, log retention policy, on-call ownership, and tested deployment rollback.
