# Contributing

## Local workflow

1. Run `make doctor` to validate prerequisites.
2. Run `make onboard` for a first installation or `make up` thereafter.
3. Create a branch from `main`; do not commit directly to `main`.
4. Keep changes inside the owning domain and expose cross-domain behavior through explicit contracts.
5. Run `pnpm check`, `pnpm security:audit`, and `make smoke` before opening a pull request.

Pull requests must explain the behavior change, migration and rollback impact, tests performed, and any security or observability considerations. Never commit `.env`, tokens, production data, or credentials.
