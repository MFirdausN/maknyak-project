.DEFAULT_GOAL := help

.PHONY: help doctor bootstrap onboard build-images infra-up up dev down logs check smoke phase1-test phase2-test ai-up disk-audit disk-clean

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
	@echo "  make phase1-test Verify tenant isolation and membership lifecycle"
	@echo "  make phase2-test Verify tenant-scoped AI project brief lifecycle"
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

phase1-test:
	./scripts/phase1-tenancy-test.sh

phase2-test:
	./scripts/phase2-project-brief-test.sh

disk-audit:
	./scripts/disk-maintenance.sh audit

disk-clean:
	./scripts/disk-maintenance.sh clean
