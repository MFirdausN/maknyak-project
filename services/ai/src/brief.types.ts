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

export interface Brief {
  id: string;
  workspaceId: string;
  principalId: string;
  title: string;
  idea: string;
  modelId: string;
  result: BriefResult;
  createdAt: string;
}

export interface BriefPage {
  items: Brief[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface GenerateBriefInput {
  workspaceId: string;
  title: string;
  idea: string;
  modelId: string;
  projectId?: string | undefined;
}
