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

Belum ada checkout atau perubahan plan manual. Payment provider nantinya hanya
mengubah status subscription; service produk tetap membaca entitlement yang
sama sehingga aturan bisnis tidak bergantung langsung pada vendor pembayaran.
