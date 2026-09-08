# Midtrans readiness (belum aktif)

Payment checkout sengaja tetap `disabled`. Tidak ada request ke Midtrans dan
tidak ada harga paket yang diasumsikan sebelum keputusan komersial dibuat.

Fondasi yang sudah tersedia:

- `PaymentAdapter` memisahkan domain subscription dari vendor.
- `MidtransSnapAdapter` membentuk request Snap melalui backend, memakai Basic
  Auth Server Key, timeout terbatas, validasi response, dan sandbox/production
  endpoint yang eksplisit.
- Verifier notification mengikuti formula SHA-512 Midtrans dan mapper status
  memisahkan `paid`, `pending`, `cancelled`, dan `ignored`.
- `workspace.checkout_sessions` siap menyimpan order ID unik, nominal IDR,
  status, redirect URL, expiry, dan hash token. Token mentah tidak perlu disimpan.

Referensi resmi:

- [Snap endpoint](https://docs.midtrans.com/reference/endpoint)
- [Backend integration dan Basic Auth](https://docs.midtrans.com/reference/backend-integration)
- [Notification signature dan idempotency](https://docs.midtrans.com/docs/https-notification-webhooks)

Sebelum aktivasi, tentukan harga Team, periode tagihan, refund policy, domain
HTTPS callback, akun merchant, Server Key sandbox, serta apakah produk memakai
Snap Redirect atau popup. Setelah itu adapter didaftarkan melalui dependency
injection, checkout session dibuat dari pending subscription change, dan webhook
Midtrans dinormalisasi menjadi billing event internal yang sudah tersedia.

Jangan pernah menaruh Server Key di browser, Git, log, atau response API.
