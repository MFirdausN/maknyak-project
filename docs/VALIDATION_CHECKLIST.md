# Checklist validasi platform

Dokumen ini membedakan implementasi yang sudah lulus quality gate, validasi
runtime lokal, dan pekerjaan production. Centang item runtime hanya setelah
command atau observasi yang disebutkan benar-benar berhasil pada image terbaru.

Status audit terakhir: 20 September 2026.

## 1. Bukti statis dan otomatis

- [x] `.env` diabaikan Git dan tidak masuk Docker build context.
- [x] `OPENAI_API_KEY` hanya diteruskan ke service AI, bukan Dashboard, browser,
      Gateway, worker, atau database.
- [x] OpenAI memakai Responses API, strict Structured Outputs, `store: false`,
      timeout, dan batas output token.
- [x] Model OpenAI disembunyikan ketika konfigurasi key tidak valid.
- [x] Actual input/output token dan estimasi biaya provider dipersistenkan.
- [x] Unit test OpenAI menggunakan mock dan tidak melakukan request berbayar.
- [x] `pnpm check` lulus: format, lint, typecheck, unit test, dan production build.
- [x] `docker compose config --quiet` dan `git diff --check` lulus.
- [x] Worktree bersih saat audit ini dilakukan.

Validasi ulang sebelum setiap merge:

```bash
git check-ignore -v .env
pnpm check
docker compose config --quiet
git diff --check
```

Jangan menampilkan, menyalin, atau memasukkan nilai `OPENAI_API_KEY` ke output
validasi.

## 2. Gate penyimpanan sebelum rebuild

Kondisi saat audit: root 85% terpakai dengan sekitar 5,3 GiB kosong; `/home`
memiliki sekitar 27 GiB kosong. Docker tidak dapat diakses dari sesi audit,
sehingga lokasi data daemon dan kondisi container harus diverifikasi dari host.

- [ ] Jalankan `make disk-audit` dan pastikan Docker/containerd tetap memakai
      partisi `/home`.
- [ ] Pastikan root memiliki ruang aman dan tidak ada pertumbuhan abnormal pada
      `/var/lib/containerd`, journal, atau temporary files.
- [ ] Jalankan `sudo make disk-clean` bila audit memang menunjukkan data yang
      aman untuk dibersihkan.
- [ ] Jangan rebuild bila disk guard menolak build atau ruang root mendekati
      batas minimum.

## 3. Aktivasi runtime OpenAI

- [ ] Jalankan `make up` agar image terbaru dibangun dan seluruh container
      dimulai ulang.
- [ ] Pastikan one-shot container `migrate` berhasil menerapkan
      `019-openai-provider.sql` dan tidak menemukan checksum mismatch.
- [ ] Jalankan `make smoke` dan pastikan seluruh readiness check lulus.
- [ ] Login ke Dashboard dan pastikan **OpenAI GPT-5.6 Luna** muncul pada
      selector Project Brief. Jangan melanjutkan jika model muncul tanpa key.
- [ ] Buat satu project brief kecil sebagai **uji berbayar yang disengaja**.
- [ ] Pastikan hasil memenuhi kontrak: summary, target users, goals, scope,
      risks, acceptance criteria, dan next steps.
- [ ] Pastikan riwayat, quality score, pagination, toast, serta auto-sync UI
      diperbarui tanpa refresh manual.
- [ ] Pastikan usage bertambah sesuai actual input/output token dan biaya tidak
      bernilai nol untuk run OpenAI.
- [ ] Pastikan log tidak memuat API key, header Authorization, isi `.env`, atau
      response upstream mentah.
- [ ] Restart service AI dan pastikan data run/usage tetap tersedia.

Uji live OpenAI tidak dijalankan oleh test suite karena memakai kredit nyata.
Lakukan hanya sekali pada payload kecil, lalu periksa usage dashboard OpenAI.

## 4. Regression runtime seluruh fase

Jalankan berurutan setelah image terbaru sehat:

```bash
make smoke
make phase1-test
make phase2-test
make phase3-test
make phase3-load-test
make phase4-test
make slo-check
make cost-report
```

- [ ] Smoke test seluruh service lulus.
- [ ] Phase 1: tenant isolation, invitation, ownership invariant, audit, dan
      outbox lulus.
- [ ] Phase 2: brief, conversation/memory, approval-gated tool, budget,
      tracing, dan isolation lulus.
- [ ] Phase 3: durable queue, approval, capability, artifact, recovery, dan
      concurrent load lulus.
- [ ] Phase 4: entitlement, usage ledger, member limit, dan billing lifecycle
      simulasi lulus.
- [ ] SLO probe dan cost report tidak menunjukkan regression.
- [ ] Backup terbaru berhasil dibuat dan satu isolated restore drill lulus.

Catatan: `make phase2-test` memvalidasi provider deterministik. Uji OpenAI live
pada bagian sebelumnya adalah validasi terpisah agar CI tidak menimbulkan biaya.

## 5. Validasi Telegram opsional

- [x] Token dan chat ID hanya diteruskan ke backend `agent-worker`.
- [x] Delivery durable memakai claim multi-worker, maksimal lima percobaan, dan
      bounded exponential backoff.
- [x] Unit test memastikan payload hanya berisi metadata dan memakai protected
      content.
- [ ] Rebuild image dan pastikan migration
      `020-telegram-notification-delivery.sql` berhasil diterapkan.
- [ ] Dengan `TELEGRAM_NOTIFICATIONS_ENABLED=false`, pastikan agent tetap
      berfungsi dan tidak ada pesan terkirim.
- [ ] Ubah ke `true`, restart `agent-worker`, lalu pastikan masing-masing satu
      pesan diterima untuk approval dan completion.
- [ ] Pastikan pesan tidak memuat prompt, goal, output, artifact, user data,
      credential, atau token.
- [ ] Simulasikan delivery gagal dan pastikan agent job tetap selesai serta
      percobaan berhenti setelah batas retry.

## 6. Yang belum selesai sebelum production

### Produk dan AI

- [ ] Validasi Project Brief, Project Planner, dan QA Reviewer dengan pengguna
      nyata serta ukur waktu yang dihemat dan kualitas hasil.
- [ ] Buat evaluation set dari kasus nyata tanpa memasukkan data sensitif.
- [ ] Validasi harga model, workspace budget, spend alert, dan batas organisasi
      pada akun OpenAI production.
- [ ] Pasang exporter/collector distributed tracing dan buktikan trace lintas
      Gateway, service, worker, database, dan object storage.
- [ ] Definisikan kebijakan retention, redaction, consent, dan penghapusan data
      untuk prompt serta output pengguna.

### Security dan operasi

- [ ] Pindahkan secret production ke secret manager; gunakan project-scoped
      service account, least privilege, rotasi, dan prosedur revocation.
- [ ] Hardening Keycloak production: TLS, hostname, optimized image, rotated
      secrets, backup, dan tanpa kredensial seed lokal.
- [ ] Jalankan security review/dependency scan pada release candidate dan uji
      recovery setelah kegagalan service nyata.
- [ ] Pasang production metrics scraper, alert routing, encrypted remote backup,
      retention, dan cloud budget integration.
- [ ] Terapkan production support IAM, approval workflow, serta remediation
      commands yang sempit dan diaudit.
- [ ] Jalankan capacity/load test sesuai target traffic, bukan hanya baseline
      antrean lokal.

### Komersial

- [ ] Tentukan harga, periode tagihan, refund policy, serta plan entitlement.
- [ ] Aktifkan Midtrans hanya setelah merchant credential, HTTPS callback,
      signature verification, settlement/reconciliation, dan mode checkout
      diputuskan.
- [ ] Bangun onboarding SaaS, product analytics, feedback loop, dan metrik
      activation/retention.
- [ ] Terapkan GitHub branch ruleset dan required CI checks sebelum workflow
      contributor dibuka.

## 7. Kriteria keputusan

- **Layak development:** bagian 1 lulus dan stack lokal sehat.
- **Layak preview/staging:** bagian 2–4 seluruhnya lulus pada environment bersih.
- **Layak production:** seluruh item bagian 5 yang relevan selesai, ada bukti
  restore dan incident drill, serta keputusan go-live manusia terdokumentasi.
