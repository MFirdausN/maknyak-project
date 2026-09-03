# ADR 0004: Infrastruktur AI opt-in di lokal

- Status: Accepted
- Date: 2026-09-03

## Decision

PostgreSQL, Redis, NATS, dan MinIO masuk profile default. Qdrant dan Ollama masuk Compose profile `ai` karena kebutuhan resource-nya tinggi dan belum diperlukan untuk core tenancy.
