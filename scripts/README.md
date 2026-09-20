# Scripts

Repository automation belongs here. Prefer portable, idempotent scripts with a documented entry in the root Makefile.

- `doctor.sh` validates required tools, Docker access, and root disk headroom.
- `smoke-test.sh` validates health and authentication boundaries of the running Compose stack.
- `slo-check.sh` samples service availability and readiness latency against explicit thresholds.
- `cost-report.sh` reports tenant budgets, durable data size, and live container resources.
- `support-report.sh` produces an audited, metadata-only workspace diagnostic report.
- `docker-build-guard.sh` prevents builds when root storage is unsafe.
- `disk-maintenance.sh` audits storage and performs explicitly requested system cleanup.
- `backup.sh` creates checksummed PostgreSQL and MinIO backups outside container storage.
- `restore-drill.sh` restores a backup into isolated temporary targets and verifies it.
