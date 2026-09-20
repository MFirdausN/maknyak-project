# Telegram notifications

Telegram notification delivery is an optional backend integration for durable
agent events. It is disabled by default and currently sends metadata-only
messages when approval is required, a job completes, or a job fails after its
retry budget is exhausted.

## Configuration

Keep these values in `.env`; never commit or print them:

```dotenv
TELEGRAM_NOTIFICATIONS_ENABLED=false
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TELEGRAM_TIMEOUT_MS=10000
```

Set `TELEGRAM_NOTIFICATIONS_ENABLED=true` only after the bot has been added to
the private chat or group and the chat ID has been verified. The token and chat
ID are passed only to `agent-worker`.

## Delivery guarantees

Migration `020-telegram-notification-delivery.sql` adds durable delivery state
to in-app agent notifications. Workers claim rows with `FOR UPDATE SKIP LOCKED`,
retry transient failure with bounded exponential backoff, and stop after five
attempts. Telegram failure never changes the agent job result.

Messages contain event type, notification title, workspace ID, and job ID. They
do not include prompts, goals, AI output, artifacts, user data, access tokens, or
credentials. Telegram API error bodies are not logged.

## Validation

After rebuilding the runtime and applying migrations:

1. Keep notifications disabled and run `make phase3-test`.
2. Enable notifications and restart `agent-worker`.
3. Create one agent job and wait for `awaiting_approval`.
4. Confirm exactly one Telegram message arrives without prompt/output content.
5. Approve the job and confirm one completion message arrives.
6. Disable notifications again when testing is complete if delivery is not
   intended to remain active.

Revoking or rotating an exposed bot token is safer than editing it in place.
