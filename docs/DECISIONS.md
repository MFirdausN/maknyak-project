# Architecture Decisions

Keputusan detail disimpan sebagai ADR yang immutable di `docs/decisions`. Jika keputusan berubah, buat ADR baru yang menggantikan ADR sebelumnya.

| ADR                                                 | Keputusan                                   | Status   |
| --------------------------------------------------- | ------------------------------------------- | -------- |
| [0001](decisions/0001-modular-first.md)             | Modular-first, extract by evidence          | Accepted |
| [0002](decisions/0002-identity-provider.md)         | OIDC provider, not custom credentials       | Accepted |
| [0003](decisions/0003-sync-and-events.md)           | HTTP for immediate outcomes, NATS for facts | Accepted |
| [0004](decisions/0004-ai-infrastructure-profile.md) | AI dependencies are opt-in locally          | Accepted |
