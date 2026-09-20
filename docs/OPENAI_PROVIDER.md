# OpenAI provider

The project-brief vertical slice supports the OpenAI Responses API through the
provider-neutral AI boundary. The default hosted model is `gpt-5.6-luna`, chosen
for cost-sensitive workloads. Local deterministic and Ollama providers remain
available.

## Security and privacy

- `OPENAI_API_KEY` remains in `.env` locally and is passed only to the AI
  service. It is never exposed to the Dashboard, browser, Gateway, worker,
  database, response payload, or logs.
- The provider sends `store: false` and requests strict Structured Outputs.
- API errors expose only the HTTP status, not upstream bodies or credentials.
- Production should use a project-scoped service-account key from a secret
  manager, with restricted model permissions, spend limits, and rotation.

Do not commit `.env`, paste keys into support output, or put a key in
`NEXT_PUBLIC_*`. If a key has been exposed, revoke it rather than merely deleting
it from Git history.

## Cost controls

The provider persists actual input/output tokens returned by the API and derives
`costMicrousd` using configurable prices. Defaults reflect the documented
`gpt-5.6-luna` prices at implementation time:

```text
OPENAI_INPUT_PRICE_MICROUSD_PER_MILLION=200000
OPENAI_OUTPUT_PRICE_MICROUSD_PER_MILLION=1200000
```

Verify official pricing before production and update these values without code
changes. Existing workspace daily token/cost limits and concurrency limits still
apply. There is no automatic fallback: a provider failure remains visible and
cannot silently create duplicate spend.

## Activation

After migration `019-openai-provider.sql` is applied and the AI container is
rebuilt with `OPENAI_API_KEY`, select **OpenAI GPT-5.6 Luna** in Project Brief.
Generating a brief is a paid API request. Unit tests use a mocked response and do
not contact OpenAI.
