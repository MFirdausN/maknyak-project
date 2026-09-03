# ADR 0003: HTTP dan event memiliki peran berbeda

- Status: Accepted
- Date: 2026-09-03

## Decision

Gunakan HTTP untuk hasil langsung dan NATS untuk fakta asynchronous. Jangan memakai event sebagai RPC terselubung. Event produksi pertama harus memakai transactional outbox dan consumer idempotency.
