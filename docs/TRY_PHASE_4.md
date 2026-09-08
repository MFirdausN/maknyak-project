# Mencoba Phase 4 — Entitlement Foundation

Vertical slice pertama Phase 4 menyediakan katalog plan provider-neutral dan
entitlement per workspace. Workspace baru otomatis memperoleh plan `Free`:
5 anggota, 25 agent job per hari, dan retensi agent artifact 30 hari. Pada
vertical slice ini enforcement aktif untuk job harian dan retensi agent;
member limit menjadi kontrak untuk iterasi subscription berikutnya.

```bash
make up
make phase4-test
```

Dashboard menampilkan plan dan limit pada workspace terpilih. Limit agent
ditegakkan oleh service AI berdasarkan authorization context dari Workspace;
request ke-26 pada hari yang sama mendapat HTTP `429`.

Belum ada checkout provider nyata. Adapter provider dapat mengirim event aktivasi
yang ditandatangani HMAC ke endpoint internal Workspace. Service produk tetap
membaca entitlement yang sama sehingga aturan bisnis tidak bergantung langsung
pada vendor pembayaran. Event hanya diterima selama lima menit, tersimpan secara
idempotent berdasarkan provider dan event ID, serta menghasilkan audit dan outbox.

Owner dapat membuat permintaan upgrade Team dari dashboard. Statusnya tetap
`pending`; plan dan limit tidak berubah sebelum adapter pembayaran yang tepercaya
mengirim event aktivasi. Setiap agent job juga menulis usage event idempotent
dalam transaksi yang sama dengan job sehingga limit aman terhadap request
konkuren.

`make phase4-test` juga mensimulasikan event payment: signature salah ditolak,
event valid mengaktifkan Team, pengiriman ulang tidak menerapkan perubahan dua
kali, dan limit Team langsung digunakan oleh service AI.

Ringkasan penggunaan pada dashboard tersinkron otomatis setiap sepuluh detik.
Kartu usage menampilkan job agent hari ini, limit plan aktif, sisa kuota, token,
biaya provider, dan aktivitas generasi brief. Semua nilai dihitung server-side
setelah tenant authorization.

Workspace Team dapat meminta downgrade ke Free. Permintaan ditolak jika jumlah
anggota masih di atas kapasitas Free. Setelah kapasitas valid, event
`subscription.cancelled` yang ditandatangani menerapkan downgrade secara
idempotent; limit Free langsung kembali berlaku tanpa menghapus usage ledger.
