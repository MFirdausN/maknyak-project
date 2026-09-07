import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBrief } from "../src/evaluation";
import { DeterministicProvider } from "../src/provider";
import { evaluationCases } from "./evaluation-cases";

for (const evaluationCase of evaluationCases) {
  test(`evaluation regression: ${evaluationCase.name}`, async () => {
    const generated = await new DeterministicProvider().generate(
      { ...evaluationCase.input },
      "project brief regression prompt",
    );
    assert.ok(
      evaluateBrief(generated.result).score >= evaluationCase.minimumScore,
    );
    const serialized = JSON.stringify(generated.result);
    for (const term of evaluationCase.requiredTerms)
      assert.match(serialized, new RegExp(term, "i"));
    assert.ok(generated.usage.inputTokens > 0);
    assert.ok(generated.usage.outputTokens > 0);
  });
}
