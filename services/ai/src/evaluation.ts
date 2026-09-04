import type { BriefEvaluation, BriefResult } from "./brief.types";

const listFields = [
  "targetUsers",
  "goals",
  "inScope",
  "outOfScope",
  "risks",
  "acceptanceCriteria",
  "nextSteps",
] as const;

export function evaluateBrief(result: BriefResult): BriefEvaluation {
  const checks = {
    summary: result.summary.trim().length >= 20,
    targetUsers: result.targetUsers.length > 0,
    goals: result.goals.length > 0,
    scope: result.inScope.length > 0 && result.outOfScope.length > 0,
    risks: result.risks.length > 0,
    acceptanceCriteria: result.acceptanceCriteria.length > 0,
    nextSteps: result.nextSteps.length > 0,
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const nonEmptyLists = listFields.filter((field) =>
    result[field].some((item) => item.trim().length > 0),
  ).length;
  return {
    score: Math.round(((passed + nonEmptyLists / listFields.length) / 8) * 100),
    checks,
    evaluator: "structural-v1",
  };
}
