# Contributing

Maknyak Platform adalah software proprietary. Kontribusi, fork, duplikasi, dan
penggunaan kode memerlukan izin tertulis dari pemilik sebelum pekerjaan
dimulai. Pull request tanpa persetujuan awal dapat ditutup tanpa review. Baca
[`LICENSE`](LICENSE) dan [aturan branching](docs/BRANCHING.md).

## Local workflow

1. Run `make doctor` to validate prerequisites.
2. Run `make onboard` for a first installation or `make up` thereafter.
3. Setelah mendapat izin, gunakan `contributor/<service>` yang dibuat dari
   `develope/dev`; jangan commit langsung ke branch yang dilindungi.
4. Keep changes inside the owning domain and expose cross-domain behavior through explicit contracts.
5. Run `pnpm check`, `pnpm security:audit`, and `make smoke` before opening a pull request.

Pull requests must explain the behavior change, migration and rollback impact, tests performed, and any security or observability considerations. Never commit `.env`, tokens, production data, or credentials.

Kontribusi tetap tunduk pada scope izin. Penerimaan pull request tidak memberi
contributor hak untuk menggunakan, mendistribusikan, atau melisensikan ulang
repository.
