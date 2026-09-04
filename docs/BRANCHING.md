# Branching dan akses kontribusi

Repository ini bersifat proprietary. Pembuatan branch, fork, pull request,
duplikasi kode, atau kontribusi dari pihak lain memerlukan izin tertulis dari
pemilik terlebih dahulu. Lihat [`LICENSE`](../LICENSE).

## Branch utama

| Branch              | Tujuan                                            | Sumber perubahan                            | Promosi ke                  |
| ------------------- | ------------------------------------------------- | ------------------------------------------- | --------------------------- |
| `main`              | Riwayat rilis dan sumber kebenaran yang stabil    | `develope/prod` setelah persetujuan pemilik | rilis/tag                   |
| `develope/prod`     | Kandidat yang siap diproduksikan                  | `develope/stagging`                         | `main`                      |
| `develope/stagging` | Integrasi dan validasi seperti produksi           | `develope/dev`                              | `develope/prod`             |
| `develope/dev`      | Integrasi aktif pekerjaan internal                | feature/fix internal                        | `develope/stagging`         |
| `develope/honeypod` | Eksperimen keamanan atau honeypot yang terisolasi | branch internal yang disetujui              | tidak dipromosikan langsung |

Nama di atas dipertahankan sebagai keputusan proyek. Jangan mengganti
`develope` menjadi `develop`, `stagging` menjadi `staging`, atau `honeypod`
menjadi `honeypot` tanpa migrasi branch yang disetujui pemilik.

## Branch contributor

Format branch eksternal adalah:

```text
contributor/<service>
```

Contoh yang dapat dibuat setelah izin diberikan:

```text
contributor/dashboard
contributor/workspace
contributor/identity
contributor/docs
```

Izin harus menyebutkan identitas contributor, service atau direktori yang
boleh diubah, tujuan perubahan, serta masa berlaku akses. Contributor tidak
boleh mengubah area di luar scope, deployment, secrets, authentication,
authorization, dependency policy, atau workflow CI kecuali disebutkan secara
tertulis.

Branch contributor dibuat dari `develope/dev` dan pull request kembali menuju
`develope/dev`. Branch contributor tidak pernah digabung langsung ke
`develope/stagging`, `develope/prod`, atau `main`.

## Aturan proteksi yang disarankan

Terapkan ruleset GitHub pada `main` dan seluruh `develope/*`:

1. Wajib pull request; larang direct push dan force push.
2. Wajib satu approval dari pemilik (`MFirdausN`).
3. Wajib status checks `quality`, `secrets`, dan `integration` lulus.
4. Wajib conversation resolution dan branch terbaru sebelum merge.
5. Batasi pembuatan, pembaruan, dan penghapusan branch kepada pemilik.

Untuk `contributor/*`, berikan akses hanya setelah scope kontribusi disetujui.
Pemilik tetap menjadi reviewer akhir melalui `.github/CODEOWNERS`.

## Alur promosi

```text
feature/fix internal ──> develope/dev ──> develope/stagging
                                              │
                                              v
                                      develope/prod ──> main ──> tag/release

contributor/<service> ──PR──> develope/dev
develope/honeypod ──> tetap terisolasi
```

Setiap promosi harus melewati CI. Perubahan database harus menjelaskan migrasi
dan rollback, sedangkan perubahan keamanan harus ditinjau eksplisit oleh
pemilik.
