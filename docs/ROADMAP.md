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

- Pilih satu customer problem, bukan generic chat.
- Provider abstraction, model registry, prompts, streaming run, usage metering.
- Conversation/memory dengan retention policy; tool execution sandbox.
- Evaluations, tracing, cost/latency budgets, dan abuse controls.

Exit: pengguna menyelesaikan satu pekerjaan bernilai dengan kualitas terukur.

## Phase 3 — Agents

- Durable job execution, approval gates, scoped credentials, artifact store.
- QA atau coding agent pertama berdasarkan demand produk.
- Evaluation suite dan human-in-the-loop operations.

Exit: agent menghemat waktu pengguna secara konsisten tanpa melanggar safety boundary.

## Phase 4 — Commercial product

- Entitlements, metering, billing, support/admin tooling.
- Produk SaaS pertama, onboarding, analytics, dan feedback loop.
- SLO, backup/restore drill, incident response, dan cost controls.

Exit: pelanggan aktif membayar dan retention membenarkan investasi platform berikutnya.
