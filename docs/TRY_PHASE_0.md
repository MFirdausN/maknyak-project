# Mencoba Phase 0

Phase 0 sudah layak dicoba sebagai fondasi lokal. Pengujian ini membuktikan
bahwa repository dapat dibangun, seluruh dependency service siap, OIDC bekerja,
migration dapat diulang, dan request authenticated melewati Gateway menuju
Workspace. Ini belum merupakan deployment produksi.

## 1. Prasyarat

- Linux dengan Node.js 22 atau lebih baru.
- pnpm 10 atau lebih baru.
- Docker Engine dan Docker Compose.
- Minimal sekitar 8 GB RAM yang tersedia dan ruang kosong yang memadai pada
  lokasi data Docker.

Validasi mesin:

```bash
cd /home/firdaus/workspace/projects/maknyak-corp
make doctor
docker info --format 'Docker root: {{.DockerRootDir}}'
df -h / /home
```

Pada mesin proyek saat ini, output Docker root yang diharapkan adalah
`/home/docker-data`. Hentikan percobaan bila ruang root mendekati batas aman.

## 2. Konfigurasi lokal

Salin konfigurasi contoh bila `.env` belum ada:

```bash
cp .env.example .env
```

Sebelum menjalankan image production-mode, ganti sedikitnya nilai berikut di
`.env` dengan nilai lokal yang unik dan jangan commit file tersebut:

```dotenv
INTERNAL_API_KEY=ganti-dengan-random-minimal-32-karakter
KEYCLOAK_ADMIN_PASSWORD=ganti-password-admin-lokal
POSTGRES_PASSWORD=ganti-password-postgres-lokal
IDENTITY_DB_PASSWORD=ganti-password-identity-lokal
WORKSPACE_DB_PASSWORD=ganti-password-workspace-lokal
KEYCLOAK_DB_PASSWORD=ganti-password-keycloak-lokal
MINIO_ROOT_PASSWORD=ganti-password-minio-lokal
```

Anda dapat membuat internal key lokal dengan:

```bash
openssl rand -hex 32
```

Pastikan `OIDC_ISSUER` menggunakan port yang sama dengan
`KEYCLOAK_HOST_PORT`. Contoh:

```dotenv
KEYCLOAK_HOST_PORT=18080
OIDC_ISSUER=http://localhost:18080/realms/maknyak
```

## 3. Jalankan platform

Untuk instalasi pertama:

```bash
make onboard
```

Perintah tersebut menjalankan pemeriksaan prasyarat, memasang dependency,
membangun image, menyalakan stack, dan menjalankan smoke test. Untuk percobaan
berikutnya cukup gunakan:

```bash
make up
make smoke
```

Periksa container:

```bash
docker compose ps
```

Gateway, Identity, Workspace, Dashboard, Keycloak, PostgreSQL, Redis, NATS,
dan MinIO harus berstatus `healthy`. Container `migrate` normalnya berstatus
`Exited (0)` karena hanya berjalan sekali.

## 4. Buka dan uji

Gunakan port aktual dari `docker compose ps`. Dengan konfigurasi mesin saat
ini:

- Dashboard: <http://localhost:13003>
- Gateway readiness: <http://localhost:13000/api/v1/health/ready>
- Keycloak: <http://localhost:18080>
- MinIO console: <http://localhost:19001>
- NATS monitoring: <http://localhost:18222>

Jalankan verifikasi otomatis:

```bash
make smoke
```

Hasil yang diharapkan berisi tujuh baris `ok`, termasuk penolakan akses tanpa
credential dan keberhasilan request OIDC dengan correlation ID.

Untuk melihat respons readiness secara manual:

```bash
curl --fail http://localhost:13000/api/v1/health/ready
```

Untuk melihat log terstruktur:

```bash
docker compose logs --tail=100 gateway identity workspace
```

Log request harus memiliki `requestId`, pathname tanpa query string, status,
dan durasi. Token Authorization tidak boleh terlihat.

## 5. Jalankan quality gate

```bash
make check
pnpm security:audit
docker compose config --quiet
```

Semua perintah harus selesai dengan exit code `0` dan audit produksi harus
melaporkan tidak ada vulnerability yang diketahui.

## 6. Hentikan platform

```bash
make down
```

Perintah ini menghentikan container tetapi mempertahankan named volume dan data
lokal. Jangan memakai `docker compose down --volumes` kecuali memang ingin
menghapus database dan seluruh state lokal.

Audit kapasitas setelah pengujian:

```bash
make disk-audit
df -h / /home
```

## Kriteria percobaan berhasil

Phase 0 dianggap berhasil pada mesin Anda bila:

1. `make check` dan `pnpm security:audit` lulus.
2. Semua service runtime berstatus healthy.
3. `make smoke` menghasilkan seluruh pemeriksaan `ok`.
4. Dashboard dapat dibuka.
5. Root filesystem tidak bertambah secara signifikan karena Docker tetap
   memakai `/home/docker-data`.

Jika gagal, simpan output `docker compose ps`, log service yang tidak sehat,
hasil `make disk-audit`, dan perintah yang gagal. Jangan membagikan `.env`,
token, atau password ketika melaporkan masalah.
