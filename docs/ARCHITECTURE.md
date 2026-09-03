# Arsitektur Maknyak Platform

Status: baseline v0.1 — 3 September 2026.

## Konteks

```text
Browser / Mobile / External Client
                 |
          API Gateway / BFF
          /              \
    Identity          Workspace       (platform control plane)
          \              /
             NATS events
                 |
 AI · Notification · Storage · Search · Billing · Automation
                 |
 PostgreSQL · Redis · MinIO · Qdrant · Ollama
```

Gateway adalah public edge dan bukan tempat business rules. Identity adalah sumber kebenaran principal dan session. Workspace adalah sumber kebenaran organization, membership, role, project, serta tenant boundary.

## Pola komunikasi

- HTTP sinkron untuk command/query yang membutuhkan jawaban langsung.
- NATS untuk fakta yang sudah terjadi dan side effect asynchronous.
- Event memakai nama `<domain>.<entity>.<past-tense>.v<major>`, misalnya `workspace.member.invited.v1`.
- Consumer harus idempotent. Delivery dianggap at-least-once.
- Database per service adalah target isolasi. Pada fase awal, satu cluster PostgreSQL boleh dipakai dengan schema/ownership terpisah.

## Request tenancy

```text
Token terverifikasi
  -> principalId
  -> workspaceId eksplisit
  -> membership/permission check
  -> domain operation
  -> audit record
```

Header tenant dari client tidak pernah dipercaya tanpa pemeriksaan membership. Semua query tenant-scoped wajib membawa `workspaceId` sebagai bagian input repository.

Gateway menerima Bearer token dan memverifikasi signature melalui remote JWKS, issuer, expiry, serta intended client. Subject token dipetakan ke principal internal dan disinkronkan ke Identity. Hanya Gateway yang meneruskan `x-principal-id`, disertai service credential yang diverifikasi Identity dan Workspace dengan constant-time comparison.

Keycloak `start-dev`, seeded password grant, dan kredensial di realm import hanya untuk local integration testing. Browser flow berikutnya harus memakai Authorization Code + PKCE. Production Keycloak memerlukan TLS, hostname eksplisit, rotated secrets, optimized image, backup, dan hardening terpisah.

## Reliability dan keamanan

- Readiness memeriksa dependency yang diperlukan; liveness hanya memeriksa process.
- Timeout, bounded retry dengan jitter, dan circuit breaking diterapkan di network boundary.
- Transactional outbox diperkenalkan sebelum event produksi pertama agar perubahan data dan publish event konsisten.
- Secrets masuk melalui environment/secret manager dan tidak disimpan di Git.
- Structured logs memuat correlation ID, service, version, principal, serta workspace bila tersedia; tidak memuat token atau PII sensitif.
- Backup PostgreSQL dan MinIO harus disertai restore drill.

## Evolusi deployment

1. Local: processes via Turbo, dependencies via Docker Compose.
2. Preview/production awal: container pada satu managed runtime dan managed data services.
3. Orchestrator terdistribusi hanya jika availability, scale, atau team ownership membutuhkan.

## Definition of done service

Service baru wajib memiliki owner/domain, contract, health endpoints, configuration validation, migrations, automated tests, structured logs, authorization policy, observability, runbook, serta rollback strategy.
