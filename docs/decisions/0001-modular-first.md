# ADR 0001: Modular-first, extract by evidence

- Status: Accepted
- Date: 2026-09-03

## Context

Visi mencakup banyak domain, tetapi tim dan traffic awal belum membenarkan biaya operasional microservices penuh.

## Decision

Buat batas domain, public contracts, dan ownership sekarang. Extract/deploy service secara independen hanya ketika ada kebutuhan terukur: scaling profile, isolation/security, release cadence, reliability, atau team ownership.

## Consequences

Repository dapat terasa seperti platform tanpa mewajibkan distributed complexity. Refactoring boundary tetap mungkin; cross-domain table access dilarang.
