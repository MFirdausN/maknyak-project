# Visi Maknyak Corp

## Misi

Membangun platform software Indonesia yang memungkinkan tim kecil meluncurkan produk digital dan agen AI dengan cepat, aman, dan konsisten tanpa membangun ulang identity, tenancy, billing, storage, notification, dan observability.

## Produk yang sedang dibangun

Maknyak Platform adalah fondasi bersama, bukan satu chatbot. Produk SaaS dan agents menggunakan kapabilitas platform melalui API serta event contracts yang stabil.

## Prinsip

1. **Customer outcome lebih dulu.** Platform hanya tumbuh untuk mendukung produk nyata.
2. **Modular sejak awal, terdistribusi saat perlu.** Batas domain tidak mengharuskan microservice prematur.
3. **Tenant isolation adalah invariant.** Semua data bisnis selalu memiliki konteks workspace.
4. **Secure by default.** Least privilege, audit trail, secret hygiene, dan explicit authorization.
5. **Operable by a small team.** Satu perintah untuk local development, health checks, observability, dan runbook.
6. **Contracts over coupling.** Interaksi lintas domain memakai API atau versioned events.
7. **Open standards and replaceable infrastructure.** Hindari ketergantungan tak perlu pada satu vendor.

## Sasaran 12 bulan pertama

- Satu alur tenant lengkap: sign-in, workspace, membership, project, dan audit.
- Satu AI vertical slice yang berguna bagi pelanggan dan memanfaatkan fondasi tersebut.
- Satu produk berbayar yang divalidasi pengguna.
- Deployment reproducible dengan backup, monitoring, dan incident runbook.

## Bukan sasaran awal

- Memecah semua domain menjadi microservice.
- Menjalankan Kubernetes sebelum beban operasional membenarkannya.
- Membuat alternatif Keycloak, model foundation, vector database, atau object storage sendiri.
- Mengembangkan banyak SaaS sebelum satu produk membuktikan demand.

## Ukuran keberhasilan

Lead time perubahan, deployment frequency, availability, tenant isolation incidents, aktivasi pengguna, retention, dan recurring revenue. Jumlah service bukan ukuran keberhasilan.
