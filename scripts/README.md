# Scripts

Repository automation belongs here. Prefer portable, idempotent scripts with a documented entry in the root Makefile.

- `doctor.sh` validates required tools, Docker access, and root disk headroom.
- `smoke-test.sh` validates health and authentication boundaries of the running Compose stack.
- `docker-build-guard.sh` prevents builds when root storage is unsafe.
- `disk-maintenance.sh` audits storage and performs explicitly requested system cleanup.
