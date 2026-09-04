# Mencoba Phase 2 — AI Project Brief

Vertical slice pertama Phase 2 mengubah ide kasar menjadi project brief
terstruktur dan menyimpannya dalam batas tenant Workspace. Baseline ini memakai
provider deterministik yang ringan agar alur dapat diuji tanpa mengunduh model.

## Jalankan baseline ringan

```bash
cd /home/firdaus/workspace/projects/maknyak-corp
docker info --format 'Docker root: {{.DockerRootDir}}'
df -h / /home
make up
make smoke
make phase2-test
```

Service AI berjalan di <http://localhost:3004/api/v1/health/ready>. Semua akses
data AI dari pengguna tetap melewati Gateway dan pemeriksaan membership
Workspace. Service AI tidak membaca tabel Workspace secara langsung.

## Coba melalui dashboard

1. Buka <http://localhost:13003> dan login sebagai `developer`.
2. Pilih atau buat workspace.
3. Panel **Project Brief Assistant** dimuat secara lazy di bawah daftar anggota.
4. Isi judul serta uraian masalah pengguna minimal 20 karakter.
5. Pilih **Local deterministic preview**, lalu buat brief.
6. Hasil streaming tampil sementara dan riwayat otomatis diperbarui.
7. Buka ringkasan pada tabel untuk melihat tujuan, scope, risiko, acceptance
   criteria, dan langkah berikutnya.

Riwayat memakai pagination server-side 10 data per halaman dan tersinkron saat
tab kembali aktif maupun setiap 10 detik. Viewer dapat membaca brief tetapi
minimal role `member` diperlukan untuk membuat brief.

## Opsional: gunakan Ollama

Ollama dan model tidak dinyalakan pada baseline karena ukurannya besar. Periksa
ruang `/home` terlebih dahulu. Untuk mengaktifkannya:

```dotenv
AI_ENABLE_OLLAMA=true
```

Kemudian jalankan dan unduh model secara eksplisit:

```bash
make ai-up
docker compose exec ollama ollama pull qwen3:4b
make up
```

Data Docker dan volume Ollama harus tetap berada di `/home/docker-data`. Model
Ollama baru muncul pada selector setelah `AI_ENABLE_OLLAMA=true` dan service AI
direstart. Jangan mengaktifkan profile ini bila kapasitas `/home` tidak cukup.

## Bukti persistence dan usage

```bash
docker compose exec -T postgres psql -U maknyak -d maknyak \
  -c "SELECT status, input_characters, output_characters, latency_ms FROM ai.runs ORDER BY created_at DESC LIMIT 10;"
```

Setiap eksekusi menyimpan versi model dan prompt, jumlah karakter input/output,
latency, status, dan error code tanpa mencatat access token.

## Status Phase 2

Project Brief adalah baseline pertama, bukan penyelesaian seluruh Phase 2.
Conversation/memory retention, evaluation dataset, quality scoring, cost budget,
abuse control khusus AI, dan tool sandbox masih menjadi pekerjaan berikutnya.
