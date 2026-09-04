import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBrief } from "../src/evaluation";

test("complete project brief receives a full structural quality score", () => {
  const evaluation = evaluateBrief({
    summary: "A sufficiently detailed and useful project summary.",
    targetUsers: ["Product team"],
    goals: ["Reduce planning time"],
    inScope: ["Brief generation"],
    outOfScope: ["Project delivery"],
    risks: ["Incomplete input"],
    acceptanceCriteria: ["Brief is actionable"],
    nextSteps: ["Validate with users"],
  });
  assert.equal(evaluation.score, 100);
  assert.equal(evaluation.evaluator, "structural-v1");
});

test("incomplete project brief receives a lower score", () => {
  const evaluation = evaluateBrief({
    summary: "Short",
    targetUsers: [],
    goals: [],
    inScope: [],
    outOfScope: [],
    risks: [],
    acceptanceCriteria: [],
    nextSteps: [],
  });
  assert.equal(evaluation.score, 0);
});
