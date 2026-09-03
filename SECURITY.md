# Security Policy

## Reporting

Do not disclose suspected vulnerabilities in a public issue. Report them privately through GitHub's **Security → Report a vulnerability** flow for this repository.

Include affected versions, reproduction steps, impact, and any suggested remediation. Do not include real access tokens, customer data, or production credentials.

## Supported versions

Until the first stable release, only the latest commit on `main` receives security fixes. Local development credentials in `.env.example` and the imported Keycloak realm are never valid for production.
