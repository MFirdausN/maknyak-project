import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTelegramNotification,
  TelegramClient,
} from "../src/telegram-notifier";

test("Telegram client sends protected metadata-only message", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedBody = "";
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    requestedUrl = String(input);
    requestedBody = String(init?.body);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    const client = new TelegramClient({
      token: "fake-telegram-token-for-unit-test",
      chatId: "-1001234567890",
      timeoutMs: 10_000,
    });
    await client.send("Agent approval required");
    assert.match(requestedUrl, /\/sendMessage$/);
    const body = JSON.parse(requestedBody) as Record<string, unknown>;
    assert.equal(body.chat_id, "-1001234567890");
    assert.equal(body.text, "Agent approval required");
    assert.equal(body.protect_content, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram notification excludes prompt and output content", () => {
  const message = formatTelegramNotification({
    id: "notice-id",
    workspace_id: "workspace-id",
    job_id: "job-id",
    kind: "approval_required",
    title: "Agent plan requires approval",
  });
  assert.match(message, /Approval diperlukan/);
  assert.match(message, /workspace-id/);
  assert.match(message, /job-id/);
  assert.doesNotMatch(message, /prompt|output|token/i);
});
