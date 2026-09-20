import assert from "node:assert/strict";
import test from "node:test";
import {
  DeterministicProvider,
  OpenAIProvider,
  ProviderRegistry,
} from "../src/provider";

test("deterministic provider produces the project brief contract", async () => {
  const chunks: string[] = [];
  const result = await new DeterministicProvider().generate(
    {
      workspaceId: "11111111-1111-4111-8111-111111111111",
      title: "Customer onboarding",
      idea: "Help small teams turn onboarding notes into a measurable workflow.",
      modelId: "brief-local-v1",
    },
    "test prompt",
    (chunk) => chunks.push(chunk),
  );
  assert.match(result.result.summary, /Customer onboarding/);
  assert.ok(result.result.acceptanceCriteria.length > 0);
  assert.ok(result.usage.inputTokens > 0);
  assert.ok(result.usage.outputTokens > 0);
  assert.ok(chunks.length > 1);
});

test("OpenAI provider uses structured Responses output and meters actual usage", async () => {
  const originalFetch = globalThis.fetch;
  let request: RequestInit | undefined;
  globalThis.fetch = (async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    request = init;
    return new Response(
      JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: "A measurable onboarding workflow",
                  targetUsers: ["Small teams"],
                  goals: ["Reduce onboarding time"],
                  inScope: ["Checklist"],
                  outOfScope: ["Payroll"],
                  risks: ["Low adoption"],
                  acceptanceCriteria: ["Time is measured"],
                  nextSteps: ["Interview users"],
                }),
              },
            ],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const provider = new OpenAIProvider("gpt-5.6-luna", {
      OPENAI_API_KEY: "test-key-that-must-never-be-logged",
      OPENAI_BASE_URL: "https://api.openai.test/v1",
      OPENAI_TIMEOUT_MS: 10_000,
      OPENAI_MAX_OUTPUT_TOKENS: 2_400,
      OPENAI_INPUT_PRICE_MICROUSD_PER_MILLION: 200_000,
      OPENAI_OUTPUT_PRICE_MICROUSD_PER_MILLION: 1_200_000,
    });
    const generated = await provider.generate(
      {
        workspaceId: "11111111-1111-4111-8111-111111111111",
        title: "Customer onboarding",
        idea: "Help small teams turn onboarding notes into a measurable workflow.",
        modelId: "brief-openai-luna-v1",
      },
      "Return a project brief",
    );
    assert.equal(generated.usage.inputTokens, 100);
    assert.equal(generated.usage.outputTokens, 50);
    assert.equal(generated.usage.costMicrousd, 80);
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
    assert.equal(body.model, "gpt-5.6-luna");
    assert.equal(body.store, false);
    assert.equal(
      (body.text as { format: { type: string; strict: boolean } }).format.type,
      "json_schema",
    );
    assert.equal(
      (body.text as { format: { type: string; strict: boolean } }).format
        .strict,
      true,
    );
    assert.equal(
      (request?.headers as Record<string, string>).authorization,
      "Bearer test-key-that-must-never-be-logged",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI provider remains unavailable when its API key is absent", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.throws(
      () => new ProviderRegistry().provider("openai", "gpt-5.6-luna"),
      /OpenAI provider is not configured/,
    );
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
