# Maknyak Platform

Fondasi software Maknyak: platform multi-tenant yang menjadi rumah bagi layanan inti, kemampuan AI, agents, dan produk SaaS.

> **Proprietary software.** Seluruh hak cipta dimiliki Muhammad Firdaus
> (`MFirdausN`). Penggunaan, duplikasi, distribusi, fork, atau kontribusi
> memerlukan izin tertulis terlebih dahulu. Lihat [LICENSE](LICENSE).

## Mulai cepat

Persyaratan: Node.js 22+, pnpm 10+, Docker, dan Docker Compose.

```bash
make doctor
make onboard
```

`make onboard` memasang dependency, membuat `.env` dari `.env.example` bila belum ada, membangun dan menjalankan stack, lalu melakukan smoke test. Pada koneksi normal, target onboarding adalah selesai dalam kurang dari 30 menit.

Alamat lokal:

| Komponen         | URL                                 |
| ---------------- | ----------------------------------- |
| Dashboard        | http://localhost:3003               |
| API Gateway      | http://localhost:3000/api/v1        |
| Identity health  | http://localhost:3001/api/v1/health |
| Workspace health | http://localhost:3002/api/v1/health |
| MinIO console    | http://localhost:9001               |
| NATS monitoring  | http://localhost:8222               |

Port host dapat diubah lewat `.env` tanpa mengubah komunikasi internal container. Nilai aktual dapat dilihat dengan `docker compose ps`; `.env.example` memakai port standar.

`make up` membangun satu shared runtime image lalu menjalankan infrastruktur dan seluruh aplikasi di Docker. Tidak ada proses Node lokal yang perlu tetap terbuka. AI runtime bersifat opsional karena membutuhkan resource besar; jalankan dengan `make ai-up`.

## Perintah

```bash
make infra-up  # PostgreSQL, Redis, NATS, MinIO
make dev       # aplikasi lokal dengan hot reload; infrastructure tetap di Docker
make ai-up     # tambah Qdrant dan Ollama
make down
make check     # lint, typecheck, test, build
pnpm security:audit
make smoke     # verifikasi stack Docker yang sedang berjalan
make disk-audit
sudo make disk-clean
```

Setiap image build menjalankan disk guard: inactive Docker build cache dibersihkan bila ruang root kurang dari 3 GiB, dan build ditolak bila masih tersisa kurang dari 1 GiB. `disk-clean` juga membatasi journal ke 100 MB, membersihkan cache APT/system temporary files, dan menghapus revisi Snap yang sudah disabled.

## Authentication lokal

Keycloak tersedia di `http://localhost:18080` (atau `KEYCLOAK_HOST_PORT`). Realm `maknyak` dan public client `maknyak-cli` diimpor otomatis. Kredensial seed berikut hanya untuk local development:

```text
username: developer
password: maknyak-dev
```

Dapatkan access token, lalu kirim sebagai Bearer token. Jangan menyimpan token ke repository atau log.

```bash
curl -X POST http://localhost:18080/realms/maknyak/protocol/openid-connect/token \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'client_id=maknyak-cli' \
  --data-urlencode 'username=developer' \
  --data-urlencode 'password=maknyak-dev' \
  --data-urlencode 'grant_type=password'
```

Gateway memverifikasi signature, issuer, expiry, dan client token melalui JWKS Keycloak. Workspace dan Identity hanya menerima principal context dari Gateway yang membawa internal service credential.

## Telemetry baseline

Gateway, Identity, dan Workspace menulis satu log JSON untuk setiap request selesai. Log memuat service, `x-request-id`, method, pathname tanpa query string, status, dan latency; header authorization dan body tidak dicatat. Gateway meneruskan correlation ID yang sama ke Identity dan Workspace. Client boleh mengirim `x-request-id` yang aman atau platform akan membuat UUID baru.

Setiap service menyediakan `/api/v1/health/live` untuk liveness dan `/api/v1/health/ready` untuk dependency-aware readiness. Endpoint `/api/v1/health` dipertahankan sebagai alias liveness.

Migration SQL dijalankan oleh one-shot container `migrate` sebelum Identity dan Workspace dimulai. Ledger `platform.schema_migrations` menyimpan nama dan checksum setiap migration; perubahan terhadap migration yang sudah diterapkan akan menggagalkan startup. File migration berada di `infrastructure/postgres/init` dan dijalankan dalam transaksi.

Mulai dari [visi](docs/VISION.md), lalu baca [arsitektur](docs/ARCHITECTURE.md), [domain](docs/DOMAINS.md), dan [roadmap](docs/ROADMAP.md). Keputusan penting dicatat sebagai ADR di `docs/decisions`.

Untuk mencoba fondasi secara lengkap, ikuti [panduan mencoba Phase 0](docs/TRY_PHASE_0.md). Strategi environment dan akses contributor dijelaskan dalam [branching policy](docs/BRANCHING.md).

## Struktur

```text
applications/   pengalaman pengguna
platform/       control plane dan kapabilitas lintas produk
services/       domain capability yang independen
agents/         autonomous workers (saat use case tersedia)
packages/       library dengan kontrak publik yang jelas
infrastructure/ konfigurasi local infrastructure
deployment/     artefak deployment per environment
docs/           living architecture
scripts/        otomasi repository
```

Repository ini adalah baseline v0.1, bukan klaim bahwa seluruh platform sudah selesai. Vertical slice Identity dan Workspace sudah memiliki OIDC, persistence PostgreSQL, tenant policy, dan Gateway boundary; lifecycle browser serta invitation/audit masih dilanjutkan pada Phase 1.

## Troubleshooting storage Docker

Docker Engine dengan containerd image store menyimpan layer di root containerd, terpisah dari `data-root` Docker. Pada mesin dengan root kecil, pastikan `/etc/containerd/config.toml` memakai lokasi pada partisi `/home`, kemudian periksa dengan `make disk-audit`. Jangan memindahkan direktori containerd ketika daemon aktif dan jangan menghapus backup sebelum `make smoke` berhasil.
