import assert from "node:assert/strict";
import test from "node:test";
import { createPlan } from "../src/agent.service";

const goals = [
  "Launch a tenant-safe customer feedback workflow with measurable adoption.",
  "Rancang proses onboarding tim kecil yang dapat divalidasi dalam dua minggu.",
];

for (const goal of goals) {
  test(`project planner regression: ${goal.slice(0, 24)}`, () => {
    const plan = createPlan(goal);
    assert.equal(plan.evaluation.score, 100);
    assert.ok(plan.milestones.length >= 3);
    assert.ok(plan.risks.length > 0);
    assert.match(plan.approvalQuestion, /\?$/);
  });
}
