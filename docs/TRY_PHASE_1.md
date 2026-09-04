# Mencoba Phase 1

Phase 1 membuktikan alur secure multi-tenancy dari browser sampai database dan
event bus. Ini masih lingkungan pengembangan lokal, bukan deployment produksi.

## Jalankan dan verifikasi otomatis

Pastikan Docker tetap memakai partisi `/home`, lalu hidupkan stack:

```bash
cd /home/firdaus/workspace/projects/maknyak-corp
docker info --format 'Docker root: {{.DockerRootDir}}'
df -h / /home
make up
make smoke
make phase1-test
```

Docker root yang diharapkan pada mesin ini adalah `/home/docker-data`. Semua
container runtime harus `healthy`; container `migrate` normal bila `Exited (0)`.
`make phase1-test` memeriksa isolasi tenant, batas role, invitation acceptance,
perlindungan owner terakhir, audit API, dan pengiriman outbox ke NATS.

Jalankan quality gate terpisah sebelum commit:

```bash
make check
pnpm security:audit
docker compose config --quiet
```

## Coba melalui browser

1. Buka <http://localhost:13003> dan pilih **Masuk dengan Keycloak**.
2. Masuk sebagai `developer` dengan password `maknyak-dev`.
3. Buat workspace dengan slug unik, lalu buat sebuah project.
4. Buat undangan untuk `collaborator@maknyak.local`; salin token yang hanya
   ditampilkan pada hasil pembuatan undangan.
5. Keluar dan masuk sebagai `collaborator` dengan password
   `maknyak-collaborator`.
6. Tempel token pada **Terima undangan**. Workspace harus muncul sesuai role
   yang diberikan.
7. Masuk kembali sebagai owner untuk mengubah role atau menghapus anggota.

Login browser menggunakan Authorization Code + PKCE. Access, refresh, dan ID
token disimpan dalam cookie `HttpOnly`; browser tidak memberikan token langsung
kepada JavaScript dashboard. Request mutasi BFF juga memvalidasi `Origin`.

## Bukti operasional

Periksa readiness dan NATS monitoring:

- Gateway: <http://localhost:13000/api/v1/health/ready>
- Keycloak: <http://localhost:18080>
- NATS: <http://localhost:18222>

Periksa log tanpa mencetak credential:

```bash
docker compose logs --tail=100 gateway workspace dashboard
```

Periksa outbox yang belum terkirim:

```bash
docker compose exec -T postgres psql -U maknyak -d maknyak \
  -c "SELECT count(*) AS unpublished FROM workspace.outbox WHERE published_at IS NULL;"
```

Nilai `unpublished` seharusnya kembali menjadi `0` setelah publisher berjalan.

## Selesai mencoba

```bash
make disk-audit
make down
```

`make down` mempertahankan named volume. Jangan menambahkan `--volumes` kecuali
Anda memang ingin menghapus seluruh state lokal.
