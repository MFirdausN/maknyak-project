export interface BriefResult {
  summary: string;
  targetUsers: string[];
  goals: string[];
  inScope: string[];
  outOfScope: string[];
  risks: string[];
  acceptanceCriteria: string[];
  nextSteps: string[];
}

export interface BriefEvaluation {
  score: number;
  checks: Record<string, boolean>;
  evaluator: "structural-v1";
}

export interface BriefFeedback {
  rating: number;
  comment?: string;
  updatedAt: string;
}

export interface Brief {
  id: string;
  workspaceId: string;
  principalId: string;
  title: string;
  idea: string;
  modelId: string;
  result: BriefResult;
  evaluation: BriefEvaluation | null;
  feedback: BriefFeedback | null;
  createdAt: string;
}

export interface BriefPage {
  items: Brief[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UsageSummary {
  runsToday: number;
  dailyRunLimit: number;
  running: number;
  maxConcurrentRuns: number;
  retentionDays: number;
}

export interface GenerateBriefInput {
  workspaceId: string;
  title: string;
  idea: string;
  modelId: string;
  projectId?: string | undefined;
}
