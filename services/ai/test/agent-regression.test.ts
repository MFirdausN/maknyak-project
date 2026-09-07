import assert from "node:assert/strict";
import test from "node:test";
import { createPlan, createQaReview } from "../src/agent.service";

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

test("QA reviewer produces a risk-based gated report", () => {
  const report = createQaReview(
    "Review tenant invitation acceptance, authorization boundaries, and regression evidence.",
  );
  assert.equal(report.evaluation.score, 100);
  assert.equal(report.verdict, "needs-evidence");
  assert.ok(report.testStrategy.length >= 3);
  assert.ok(report.risks.some((risk) => risk.severity === "high"));
  assert.match(report.approvalQuestion, /\?$/);
});
