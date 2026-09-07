# Roadmap

Roadmap berbasis outcome. Tanggal ditetapkan setelah kapasitas tim dan produk pertama dipilih.

## Phase 0 — Foundation

- [x] Monorepo, quality gates, local infrastructure, environment contract.
- [x] Vision, architecture, domain map, dan ADR awal.
- [x] CI untuk install, lint, typecheck, test, build, secret scanning, dependency audit, dan Docker integration smoke.
- [x] Baseline telemetry, preflight, smoke test, dan developer onboarding tervalidasi melalui rebuild storage bersih.

Exit: contributor baru dapat menjalankan repository dan memahami batas domain dalam kurang dari 30 menit.

## Phase 1 — Secure multi-tenancy

- [x] Workspace, owner membership, role policy, project, dan tenant-scoped queries.
- [x] Idempotent SQL migrations dan transactional outbox pada workspace creation.
- [x] Gateway proxy dengan validation, timeout, dan upstream error propagation.
- [x] OIDC authentication, JWKS verification, dan Identity principal synchronization.
- [x] Internal service credential melindungi Identity dan Workspace trust boundary.
- [x] Browser Authorization Code + PKCE, logout, refresh, dan session lifecycle.
- [x] Invitation lifecycle dengan token hash, email binding, expiry, revoke, dan acceptance.
- [x] Ownership invariant yang aman terhadap mutasi konkuren dan tenant isolation suite.
- [x] Append-only audit log serta transactional outbox publisher ke NATS.
- [x] Dashboard untuk workspace, project, invitation, dan membership management.
- [x] Gateway request context, Redis rate limiting, body limit, dan security headers.
- [x] Full quality gate, Docker smoke test, serta Phase 1 integration test di CI.

Exit: end-to-end tenant isolation tests lulus dan satu pengguna dapat mengelola workspace secara aman.

## Phase 2 — AI vertical slice

- [x] Pilih customer problem pertama: mengubah ide kasar menjadi project brief terstruktur.
- [x] Baseline provider abstraction, model registry, versioned prompt, streaming run, dan usage metering.
- [x] Tenant-scoped brief history dengan pagination 10 item dan lazy-loaded dashboard UI.
- [x] Structural quality scoring, user feedback, daily/concurrency budgets, dan data retention cleanup.
- [x] Tenant-scoped conversation/memory dengan retention dan dashboard workbench.
- [x] Versioned evaluation fixtures, regression suite, token/cost metering, serta W3C trace propagation.
- [x] Allowlisted tool sandbox dengan admin approval gate dan persisted execution state.

Exit: pengguna menyelesaikan satu pekerjaan bernilai dengan kualitas terukur. Baseline Phase 2 terpenuhi; exporter trace dan provider berbayar divalidasi saat environment observability/credential tersedia.

## Phase 3 — Agents

- [x] Durable PostgreSQL job queue, worker lease recovery, bounded retry, dan persisted steps.
- [x] Human approval gate, one-time scoped capability grant, dan checksummed JSON artifact store.
- [x] Project Planner agent pertama dengan structural evaluation regression suite.
- [x] MinIO object storage, in-app approval notification, queue metrics, dan worker process terpisah yang dapat diskalakan.
- [x] Automated multi-instance recovery drill, worker heartbeat, dan bounded local concurrency test.
- Validasi penggunaan nyata sebelum production.
- QA atau coding agent berikutnya berdasarkan demand produk.

Exit: agent menghemat waktu pengguna secara konsisten tanpa melanggar safety boundary. Status: vertical slice pertama tersedia; validasi penggunaan nyata dan operasi production masih diperlukan.

## Phase 4 — Commercial product

- Entitlements, metering, billing, support/admin tooling.
- Produk SaaS pertama, onboarding, analytics, dan feedback loop.
- SLO, backup/restore drill, incident response, dan cost controls.

Exit: pelanggan aktif membayar dan retention membenarkan investasi platform berikutnya.
