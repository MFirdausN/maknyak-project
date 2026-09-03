# ADR 0002: Gunakan OIDC provider

- Status: Accepted
- Date: 2026-09-03

## Decision

Platform menggunakan standar OIDC/OAuth 2.1 melalui provider yang dapat diganti. Credential storage dan authentication protocol tidak dibangun sendiri. Keycloak dipakai sebagai provider local development; keputusan provider deployment final tetap menunggu kebutuhan produk.

Identity service tetap memiliki profile internal dan pemetaan external subject ke principal Maknyak.
