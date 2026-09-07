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
structural evaluation, approval gate, artifact checksum, trace context, serta
revocation capability setelah digunakan.

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

Job menggunakan pagination server-side 10 data per halaman. Viewer hanya dapat
membaca. Member dapat membuat/cancel job miliknya; owner/admin menangani
approval.

## Failure dan recovery model

Worker memakai row locking `FOR UPDATE SKIP LOCKED`, sehingga beberapa instance
dapat berbagi antrean tanpa mengklaim job yang sama. Job `running` dengan lease
lebih dari dua menit dipulihkan ketika service dimulai. Kegagalan step dijadwal
ulang dengan backoff lima detik per attempt dan berhenti setelah tiga attempt.

Artifact awal disimpan sebagai JSON maksimal 256 KiB di PostgreSQL. Ini sengaja
menjaga vertical slice ringan. Artifact besar harus dipindahkan ke object
storage MinIO pada iterasi Phase 3 berikutnya; database hanya menyimpan metadata,
policy, checksum, dan object key.

## Batas fase saat ini

Project Planner adalah agent pertama, bukan coding agent. Runtime belum memberi
akses shell, repository, credential pihak ketiga, atau network. Notification
approval, artifact object storage, queue administration, dan recovery drill
multi-instance adalah pekerjaan berikutnya sebelum klaim production-ready.
