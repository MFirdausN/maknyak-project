.DEFAULT_GOAL := help

.PHONY: help doctor bootstrap onboard build-images infra-up up dev down logs check smoke slo-check cost-report support-report phase1-test phase2-test phase3-test phase3-load-test phase4-test backup restore-drill ai-up disk-audit disk-clean

help:
	@echo "Maknyak Platform"
	@echo "  make doctor     Validate local development prerequisites"
	@echo "  make bootstrap  Install dependencies and create .env"
	@echo "  make onboard    Bootstrap, start, and verify a clean environment"
	@echo "  make up         Build and start the complete platform in Docker"
	@echo "  make infra-up   Start core infrastructure only"
	@echo "  make ai-up      Start optional AI infrastructure"
	@echo "  make down       Stop infrastructure"
	@echo "  make check      Run all quality checks"
	@echo "  make smoke      Verify the running Docker stack"
	@echo "  make slo-check  Sample service availability and readiness latency"
	@echo "  make cost-report Report tenant usage, data size, and container resources"
	@echo "  make support-report WORKSPACE=<id-or-slug> SUPPORT_OPERATOR_ID=<uuid> SUPPORT_REASON='<reason>'"
	@echo "  make phase1-test Verify tenant isolation and membership lifecycle"
	@echo "  make phase2-test Verify tenant-scoped AI project brief lifecycle"
	@echo "  make phase3-test Verify durable approval-gated agent lifecycle"
	@echo "  make phase3-load-test Validate concurrent agent queue processing"
	@echo "  make phase4-test Verify workspace entitlements and enforced limits"
	@echo "  make backup      Back up PostgreSQL and MinIO to BACKUP_DIR"
	@echo "  make restore-drill BACKUP=<path> Verify a backup in isolated temporary targets"
	@echo "  make disk-audit Inspect root, home, Docker, and journal usage"
	@echo "  make disk-clean Clean safe caches/logs (run with sudo)"

bootstrap:
	@test -f .env || cp .env.example .env
	pnpm install

doctor:
	./scripts/doctor.sh

onboard: doctor bootstrap up smoke

infra-up:
	docker compose up -d --wait postgres redis nats minio

build-images:
	./scripts/docker-build-guard.sh
	docker build -t maknyak-platform-runtime:latest .

ai-up:
	docker compose --profile ai up -d --wait

up: build-images
	docker compose up -d --wait

dev:
	pnpm dev

down:
	docker compose --profile ai down

logs:
	docker compose --profile ai logs -f

check:
	pnpm check

smoke:
	./scripts/smoke-test.sh

slo-check:
	./scripts/slo-check.sh

cost-report:
	./scripts/cost-report.sh

support-report:
	@test -n "$(WORKSPACE)" || { echo "WORKSPACE is required" >&2; exit 2; }
	@test -n "$(SUPPORT_OPERATOR_ID)" || { echo "SUPPORT_OPERATOR_ID is required" >&2; exit 2; }
	@test -n "$(SUPPORT_REASON)" || { echo "SUPPORT_REASON is required" >&2; exit 2; }
	@SUPPORT_WORKSPACE="$(WORKSPACE)" SUPPORT_OPERATOR_ID="$(SUPPORT_OPERATOR_ID)" SUPPORT_REASON="$(SUPPORT_REASON)" ./scripts/support-report.sh

phase1-test:
	./scripts/phase1-tenancy-test.sh

phase2-test:
	./scripts/phase2-project-brief-test.sh

phase3-test:
	./scripts/phase3-agent-test.sh

phase3-load-test:
	./scripts/phase3-load-test.sh

phase4-test:
	./scripts/phase4-entitlement-test.sh

backup:
	./scripts/backup.sh

restore-drill:
	@test -n "$(BACKUP)" || { echo "Usage: make restore-drill BACKUP=<backup-directory>" >&2; exit 2; }
	./scripts/restore-drill.sh "$(BACKUP)"

disk-audit:
	./scripts/disk-maintenance.sh audit

disk-clean:
	./scripts/disk-maintenance.sh clean
