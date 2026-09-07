# Mencoba Phase 3 — Durable Project Planner Agent

Vertical slice pertama Phase 3 menerima goal, membuat project plan pada worker
durable, berhenti untuk persetujuan manusia, lalu menerbitkan artifact setelah
owner/admin memberi capability terbatas.

## Verifikasi otomatis

```bash
cd /home/firdaus/workspace/projects/maknyak-corp
docker info --format 'Docker root: {{.DockerRootDir}}'
df -h / /home
make up
make smoke
make phase3-test
```

Integration test membuktikan checkpoint `awaiting_approval`, tenant isolation,
structural evaluation, approval gate dan notifikasi, artifact MinIO beserta
checksum, trace context, revocation capability, serta recovery worker.

## Coba melalui dashboard

1. Buka <http://localhost:13003> dan login sebagai `developer`.
2. Pilih workspace dan temukan panel **Project Planner Agent**.
3. Masukkan goal minimal 20 karakter, lalu klik **Jalankan agent**.
4. Job berpindah `queued` → `running` → `awaiting_approval`. Tampilan
   tersinkron otomatis setiap tiga detik.
5. Tinjau draft dan langkah yang tersimpan. Owner/admin dapat memilih
   **Approve & publish** atau **Reject**.
6. Setelah approval, worker menggunakan capability `artifact.write`, membuat
   artifact JSON beserta checksum SHA-256, lalu merevoke capability tersebut.
7. Owner/admin melihat metrik antrean dan notifikasi approval pada panel yang
   tersinkron otomatis.

Job menggunakan pagination server-side 10 data per halaman. Viewer hanya dapat
membaca. Member dapat membuat/cancel job miliknya; owner/admin menangani
approval.

## Failure dan recovery model

Worker memakai row locking `FOR UPDATE SKIP LOCKED`, sehingga beberapa instance
dapat berbagi antrean tanpa mengklaim job yang sama. Job `running` dengan lease
lebih dari dua menit dipulihkan ketika service dimulai. Kegagalan step dijadwal
ulang dengan backoff lima detik per attempt dan berhenti setelah tiga attempt.

Artifact disimpan di bucket MinIO `maknyak-agent-artifacts`. PostgreSQL hanya
menyimpan metadata, policy, checksum, dan object key. API mengambil isi artifact
setelah pemeriksaan akses tenant, sehingga bucket tidak perlu dibuka ke browser.

## Batas fase saat ini

Project Planner adalah agent pertama, bukan coding agent. Runtime tidak memberi
akses shell, repository, credential pihak ketiga, atau network. Backup/restore,
observability eksternal, dan validasi beban nyata tetap diperlukan sebelum
klaim production-ready.
