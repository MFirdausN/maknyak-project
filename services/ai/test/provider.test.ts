import assert from "node:assert/strict";
import test from "node:test";
import { DeterministicProvider } from "../src/provider";

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
  assert.match(result.summary, /Customer onboarding/);
  assert.ok(result.acceptanceCriteria.length > 0);
  assert.ok(chunks.length > 1);
});
