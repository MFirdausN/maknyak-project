import { createHash } from "node:crypto";
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Pool } from "pg";
import { DATABASE } from "./database";
import { ObjectStore } from "./object-store";

interface JobRow {
  id: string;
  workspace_id: string;
  requested_by: string;
  agent_key: AgentKey;
  goal: string;
  input: Record<string, unknown>;
  output: unknown;
  status: string;
  phase: "plan" | "finalize";
  attempt: number;
  max_attempts: number;
  error_code: string | null;
  trace_id: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}
type AgentKey = "project-planner-v1" | "qa-reviewer-v1";
interface StepRow {
  id: string;
  name: string;
  status: string;
  attempt: number;
  output: unknown;
  error_code: string | null;
  started_at: Date;
  completed_at: Date | null;
}
interface ArtifactRow {
  id: string;
  job_id: string;
  kind: string;
  name: string;
  media_type: string;
  content: unknown | null;
  storage_backend: "postgres" | "minio";
  object_key: string | null;
  size_bytes: number;
  checksum_sha256: string;
  created_at: Date;
}

@Injectable()
export class AgentService {
  constructor(
    @Inject(DATABASE) private readonly database: Pool,
    @Inject(ObjectStore) private readonly objects: ObjectStore,
  ) {}

  async create(
    principalId: string,
    workspaceId: string,
    goal: string,
    agentKey: AgentKey,
    traceId?: string,
  ) {
    const authorization = await this.authorize(
      principalId,
      workspaceId,
      "member",
    );
    const retention = authorization.entitlements.retentionDays;
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `agent-usage:${workspaceId}`,
      ]);
      const used = await client.query<{ quantity: string }>(
        `SELECT COALESCE(sum(quantity), 0)::text AS quantity FROM agent.usage_events
         WHERE workspace_id = $1 AND metric = 'agent.job.created' AND occurred_at >= date_trunc('day', now())`,
        [workspaceId],
      );
      if (
        Number(used.rows[0]?.quantity ?? 0) >=
        authorization.entitlements.dailyAgentJobLimit
      )
        throw new HttpException("Daily agent job entitlement reached", 429);
      const result = await client.query<JobRow>(
        `INSERT INTO agent.jobs (workspace_id, requested_by, agent_key, goal, trace_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6)) RETURNING *`,
        [workspaceId, principalId, agentKey, goal, traceId ?? null, retention],
      );
      await client.query(
        `INSERT INTO agent.usage_events (workspace_id, principal_id, job_id, metric) VALUES ($1, $2, $3, 'agent.job.created')`,
        [workspaceId, principalId, result.rows[0]!.id],
      );
      await client.query("COMMIT");
      return job(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(principalId: string, workspaceId: string, page: number) {
    await this.authorize(principalId, workspaceId, "viewer");
    const pageSize = 10;
    const [rows, count] = await Promise.all([
      this.database.query<JobRow>(
        `SELECT * FROM agent.jobs WHERE workspace_id = $1 AND expires_at > now() ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
        [workspaceId, pageSize, (page - 1) * pageSize],
      ),
      this.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM agent.jobs WHERE workspace_id = $1 AND expires_at > now()`,
        [workspaceId],
      ),
    ]);
    const total = Number(count.rows[0]?.count ?? 0);
    return {
      items: rows.rows.map(job),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async detail(principalId: string, jobId: string) {
    const row = await this.jobRow(jobId);
    await this.authorize(principalId, row.workspace_id, "viewer");
    const [steps, artifacts] = await Promise.all([
      this.database.query<StepRow>(
        `SELECT id, name, status, attempt, output, error_code, started_at, completed_at FROM agent.steps WHERE job_id = $1 ORDER BY started_at, id`,
        [jobId],
      ),
      this.database.query<ArtifactRow>(
        `SELECT * FROM agent.artifacts WHERE job_id = $1 AND expires_at > now() ORDER BY created_at`,
        [jobId],
      ),
    ]);
    return {
      ...job(row),
      steps: steps.rows.map(step),
      artifacts: await Promise.all(
        artifacts.rows.map(async (row) =>
          artifact(
            row,
            row.storage_backend === "minio" && row.object_key
              ? JSON.parse(await this.objects.get(row.object_key))
              : row.content,
          ),
        ),
      ),
    };
  }

  async decide(
    principalId: string,
    jobId: string,
    decision: "approved" | "rejected",
    note?: string,
  ) {
    const row = await this.jobRow(jobId);
    await this.authorize(principalId, row.workspace_id, "admin");
    if (row.status !== "awaiting_approval")
      throw new ConflictException("Agent job is not awaiting approval");
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO agent.approvals (job_id, workspace_id, decision, decided_by, note) VALUES ($1, $2, $3, $4, $5)`,
        [jobId, row.workspace_id, decision, principalId, note ?? null],
      );
      await client.query(
        `UPDATE agent.notifications SET read_by = array_append(read_by, $2::uuid)
         WHERE job_id = $1 AND kind = 'approval_required' AND NOT ($2::uuid = ANY(read_by))`,
        [jobId, principalId],
      );
      if (decision === "approved") {
        await client.query(
          `INSERT INTO agent.capability_grants (job_id, workspace_id, scope, granted_by, expires_at) VALUES ($1, $2, 'artifact.write', $3, now() + interval '1 hour')`,
          [jobId, row.workspace_id, principalId],
        );
        await client.query(
          `UPDATE agent.jobs SET status = 'queued', phase = 'finalize', next_attempt_at = now(), updated_at = now() WHERE id = $1`,
          [jobId],
        );
      } else {
        await client.query(
          `UPDATE agent.jobs SET status = 'rejected', completed_at = now(), updated_at = now() WHERE id = $1`,
          [jobId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.detail(principalId, jobId);
  }

  async cancel(principalId: string, jobId: string) {
    const row = await this.jobRow(jobId);
    await this.authorize(principalId, row.workspace_id, "member");
    if (row.requested_by !== principalId)
      await this.authorize(principalId, row.workspace_id, "admin");
    const result = await this.database.query<JobRow>(
      `UPDATE agent.jobs SET status = 'cancelled', completed_at = now(), updated_at = now(), locked_at = NULL, locked_by = NULL
       WHERE id = $1 AND status IN ('queued', 'awaiting_approval') RETURNING *`,
      [jobId],
    );
    if (!result.rows[0])
      throw new ConflictException(
        "Running or completed agent job cannot be cancelled",
      );
    return job(result.rows[0]);
  }

  async recoverStale(): Promise<number> {
    const result = await this.database.query(
      `UPDATE agent.jobs SET status = CASE WHEN attempt < max_attempts THEN 'queued' ELSE 'failed' END,
        error_code = 'worker_lease_expired', next_attempt_at = now(), locked_at = NULL, locked_by = NULL, updated_at = now()
       WHERE status = 'running' AND locked_at < now() - interval '2 minutes'`,
    );
    return result.rowCount ?? 0;
  }

  async operations(principalId: string, workspaceId: string) {
    await this.authorize(principalId, workspaceId, "admin");
    const [result, workers] = await Promise.all([
      this.database.query<{
        queued: string;
        running: string;
        awaiting_approval: string;
        succeeded: string;
        failed: string;
        stale_running: string;
        oldest_queued_seconds: string | null;
      }>(
        `SELECT
        count(*) FILTER (WHERE status = 'queued')::text AS queued,
        count(*) FILTER (WHERE status = 'running')::text AS running,
        count(*) FILTER (WHERE status = 'awaiting_approval')::text AS awaiting_approval,
        count(*) FILTER (WHERE status = 'succeeded')::text AS succeeded,
        count(*) FILTER (WHERE status = 'failed' AND updated_at > now() - interval '24 hours')::text AS failed,
        count(*) FILTER (WHERE status = 'running' AND locked_at < now() - interval '2 minutes')::text AS stale_running,
        extract(epoch FROM now() - min(created_at) FILTER (WHERE status = 'queued'))::text AS oldest_queued_seconds
       FROM agent.jobs WHERE workspace_id = $1 AND expires_at > now()`,
        [workspaceId],
      ),
      this.database.query<{
        active_workers: string;
        processed_jobs: string;
      }>(
        `SELECT count(*)::text AS active_workers, COALESCE(sum(processed_jobs), 0)::text AS processed_jobs
         FROM agent.worker_heartbeats WHERE heartbeat_at > now() - interval '10 seconds'`,
      ),
    ]);
    const value = result.rows[0]!;
    return {
      queued: Number(value.queued),
      running: Number(value.running),
      awaitingApproval: Number(value.awaiting_approval),
      succeeded: Number(value.succeeded),
      failedLast24Hours: Number(value.failed),
      staleRunning: Number(value.stale_running),
      oldestQueuedSeconds:
        value.oldest_queued_seconds === null
          ? null
          : Math.round(Number(value.oldest_queued_seconds)),
      activeWorkers: Number(workers.rows[0]?.active_workers ?? 0),
      workerProcessedJobs: Number(workers.rows[0]?.processed_jobs ?? 0),
    };
  }

  async heartbeat(workerId: string, processed = false) {
    await this.database.query(
      `INSERT INTO agent.worker_heartbeats (worker_id, processed_jobs) VALUES ($1, $2)
       ON CONFLICT (worker_id) DO UPDATE SET heartbeat_at = now(),
         processed_jobs = agent.worker_heartbeats.processed_jobs + $2`,
      [workerId, processed ? 1 : 0],
    );
  }

  async unregisterWorker(workerId: string) {
    await this.database.query(
      `DELETE FROM agent.worker_heartbeats WHERE worker_id = $1`,
      [workerId],
    );
  }

  async notifications(principalId: string, workspaceId: string) {
    await this.authorize(principalId, workspaceId, "admin");
    const result = await this.database.query<{
      id: string;
      job_id: string;
      kind: string;
      title: string;
      read: boolean;
      created_at: Date;
    }>(
      `SELECT id, job_id, kind, title, ($2::uuid = ANY(read_by)) AS read, created_at
       FROM agent.notifications WHERE workspace_id = $1 AND expires_at > now()
       ORDER BY created_at DESC, id DESC LIMIT 50`,
      [workspaceId, principalId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      kind: row.kind,
      title: row.title,
      read: row.read,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async readNotification(principalId: string, notificationId: string) {
    const found = await this.database.query<{ workspace_id: string }>(
      `SELECT workspace_id FROM agent.notifications WHERE id = $1 AND expires_at > now()`,
      [notificationId],
    );
    if (!found.rows[0])
      throw new NotFoundException("Agent notification not found");
    await this.authorize(principalId, found.rows[0].workspace_id, "admin");
    await this.database.query(
      `UPDATE agent.notifications SET read_by = array_append(read_by, $2::uuid)
       WHERE id = $1 AND NOT ($2::uuid = ANY(read_by))`,
      [notificationId, principalId],
    );
    return { id: notificationId, read: true };
  }

  async processNext(workerId: string): Promise<boolean> {
    const client = await this.database.connect();
    let claimed: JobRow | undefined;
    try {
      await client.query("BEGIN");
      const result = await client.query<JobRow>(
        `SELECT * FROM agent.jobs WHERE status = 'queued' AND next_attempt_at <= now()
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      claimed = result.rows[0];
      if (!claimed) {
        await client.query("COMMIT");
        return false;
      }
      const updated = await client.query<JobRow>(
        `UPDATE agent.jobs SET status = 'running', attempt = attempt + 1, locked_at = now(), locked_by = $2, updated_at = now() WHERE id = $1 RETURNING *`,
        [claimed.id, workerId],
      );
      claimed = updated.rows[0]!;
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await this.execute(claimed);
    return true;
  }

  private async execute(row: JobRow) {
    const stepName =
      row.phase === "finalize"
        ? "publish-artifact"
        : row.agent_key === "qa-reviewer-v1"
          ? "review-quality"
          : "create-plan";
    const started = await this.database.query<{ id: string }>(
      `INSERT INTO agent.steps (job_id, workspace_id, name, status, attempt, input) VALUES ($1, $2, $3, 'running', $4, $5::jsonb) RETURNING id`,
      [
        row.id,
        row.workspace_id,
        stepName,
        row.attempt,
        JSON.stringify({ goal: row.goal }),
      ],
    );
    const stepId = started.rows[0]!.id;
    try {
      if (row.phase === "plan") {
        const draft = createAgentDraft(row.agent_key, row.goal);
        await this.database.query(
          `UPDATE agent.steps SET status = 'succeeded', output = $2::jsonb, completed_at = now() WHERE id = $1`,
          [stepId, JSON.stringify(draft)],
        );
        await this.database.query(
          `WITH updated AS (
             UPDATE agent.jobs SET status = 'awaiting_approval', output = $2::jsonb, locked_at = NULL, locked_by = NULL, updated_at = now()
             WHERE id = $1 AND status = 'running' RETURNING id, workspace_id, expires_at
           ) INSERT INTO agent.notifications (workspace_id, job_id, kind, minimum_role, title, expires_at)
             SELECT workspace_id, id, 'approval_required', 'admin', $3, expires_at FROM updated
             ON CONFLICT (job_id, kind) DO NOTHING`,
          [row.id, JSON.stringify({ draft }), approvalTitle(row.agent_key)],
        );
      } else {
        await this.publishArtifact(row, stepId);
      }
    } catch {
      const retry = row.attempt < row.max_attempts;
      await this.database.query(
        `UPDATE agent.steps SET status = 'failed', error_code = 'step_failed', completed_at = now() WHERE id = $1`,
        [stepId],
      );
      await this.database.query(
        `UPDATE agent.jobs SET status = $2, error_code = 'step_failed', next_attempt_at = now() + ($3 * interval '5 seconds'),
          locked_at = NULL, locked_by = NULL, updated_at = now(), completed_at = CASE WHEN $2 = 'failed' THEN now() ELSE NULL END WHERE id = $1`,
        [row.id, retry ? "queued" : "failed", row.attempt],
      );
      if (!retry)
        await this.database.query(
          `INSERT INTO agent.notifications (workspace_id, job_id, kind, minimum_role, title, expires_at)
           SELECT workspace_id, id, 'job_failed', 'admin', 'Agent job failed after retries', expires_at FROM agent.jobs WHERE id = $1
           ON CONFLICT (job_id, kind) DO NOTHING`,
          [row.id],
        );
    }
  }

  private async publishArtifact(row: JobRow, stepId: string) {
    const grant = await this.database.query(
      `SELECT 1 FROM agent.capability_grants WHERE job_id = $1 AND scope = 'artifact.write' AND revoked_at IS NULL AND expires_at > now()`,
      [row.id],
    );
    if (!grant.rows[0])
      throw new ForbiddenException(
        "Artifact write capability is missing or expired",
      );
    const content = (row.output as { draft?: unknown } | null)?.draft;
    if (!content) throw new Error("Approved plan draft is missing");
    const encoded = JSON.stringify(content);
    const checksum = createHash("sha256").update(encoded).digest("hex");
    const objectKey = `${row.workspace_id}/${row.agent_key}/${row.id}/${checksum}.json`;
    const artifactKind =
      row.agent_key === "qa-reviewer-v1" ? "qa-report" : "project-plan";
    await this.objects.put(objectKey, encoded);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const artifactResult = await client.query<{ id: string }>(
        `INSERT INTO agent.artifacts (job_id, workspace_id, kind, name, content, storage_backend, object_key, size_bytes, checksum_sha256, expires_at)
         SELECT id, workspace_id, $2, left(goal, 150), NULL, 'minio', $3, $4, $5, expires_at FROM agent.jobs WHERE id = $1 RETURNING id`,
        [row.id, artifactKind, objectKey, Buffer.byteLength(encoded), checksum],
      );
      await client.query(
        `UPDATE agent.steps SET status = 'succeeded', output = $2::jsonb, completed_at = now() WHERE id = $1`,
        [
          stepId,
          JSON.stringify({ artifactId: artifactResult.rows[0]!.id, checksum }),
        ],
      );
      await client.query(
        `INSERT INTO agent.notifications (workspace_id, job_id, kind, minimum_role, title, expires_at)
         SELECT workspace_id, id, 'job_completed', 'viewer', 'Agent artifact is ready', expires_at FROM agent.jobs WHERE id = $1
         ON CONFLICT (job_id, kind) DO NOTHING`,
        [row.id],
      );
      await client.query(
        `UPDATE agent.jobs SET status = 'succeeded', output = $2::jsonb, completed_at = now(), updated_at = now(), locked_at = NULL, locked_by = NULL WHERE id = $1`,
        [
          row.id,
          JSON.stringify({ artifactId: artifactResult.rows[0]!.id, checksum }),
        ],
      );
      await client.query(
        `UPDATE agent.capability_grants SET revoked_at = now() WHERE job_id = $1`,
        [row.id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      await this.objects.delete(objectKey).catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async jobRow(id: string) {
    const result = await this.database.query<JobRow>(
      `SELECT * FROM agent.jobs WHERE id = $1 AND expires_at > now()`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException("Agent job not found");
    return result.rows[0];
  }
  private async retentionDays(workspaceId: string) {
    const result = await this.database.query<{ retention_days: number }>(
      `SELECT COALESCE((SELECT retention_days FROM ai.workspace_limits WHERE workspace_id = $1), 90) AS retention_days`,
      [workspaceId],
    );
    return result.rows[0]?.retention_days ?? 90;
  }
  private async authorize(
    principalId: string,
    workspaceId: string,
    minimumRole: string,
  ): Promise<{
    entitlements: { dailyAgentJobLimit: number; retentionDays: number };
  }> {
    const response = await fetch(
      `${process.env.WORKSPACE_URL ?? "http://workspace:3002"}/api/v1/internal/authorize`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-api-key": process.env.INTERNAL_API_KEY ?? "",
          "x-principal-id": principalId,
        },
        body: JSON.stringify({ workspaceId, minimumRole }),
        signal: AbortSignal.timeout(3000),
      },
    );
    const payload = (await response.json()) as {
      message?: string;
      entitlements: { dailyAgentJobLimit: number; retentionDays: number };
    };
    if (!response.ok) {
      if (response.status === 404)
        throw new NotFoundException(payload.message ?? "Workspace not found");
      if (response.status === 403)
        throw new ForbiddenException(
          payload.message ?? "Insufficient workspace permission",
        );
      throw new BadGatewayException(
        payload.message ?? "Workspace authorization failed",
      );
    }
    return payload;
  }
}

export function createPlan(goal: string) {
  const plan = {
    summary: goal,
    milestones: [
      "Validate the goal and success metric",
      "Build the smallest testable workflow",
      "Measure results and review risks",
    ],
    risks: ["Unclear acceptance criteria", "Scope expansion without evidence"],
    approvalQuestion: "Approve publishing this project plan artifact?",
  };
  return { ...plan, evaluation: evaluateAgentPlan(plan) };
}
export function createQaReview(goal: string) {
  const report = {
    scope: goal,
    verdict: "needs-evidence" as const,
    testStrategy: [
      "Verify the primary acceptance path with reproducible evidence",
      "Exercise authorization and tenant-isolation boundaries",
      "Test failure, retry, and recovery behavior",
    ],
    risks: [
      {
        severity: "high",
        finding: "Acceptance evidence has not been attached",
      },
      {
        severity: "medium",
        finding: "Regression impact requires explicit verification",
      },
    ],
    evidenceGaps: [
      "Automated test result",
      "Observed result versus acceptance criteria",
    ],
    releaseRecommendation:
      "Hold release until high-severity evidence gaps are resolved",
    approvalQuestion: "Approve publishing this QA review artifact?",
  };
  return { ...report, evaluation: evaluateQaReview(report) };
}
export function evaluateQaReview(report: {
  scope: string;
  testStrategy: string[];
  risks: Array<{ severity: string; finding: string }>;
  evidenceGaps: string[];
  releaseRecommendation: string;
  approvalQuestion: string;
}) {
  const checks = {
    meaningfulScope: report.scope.trim().length >= 20,
    riskBasedStrategy:
      report.testStrategy.length >= 3 && report.risks.length > 0,
    evidenceAware: report.evidenceGaps.length > 0,
    explicitDecision:
      report.releaseRecommendation.length > 10 &&
      report.approvalQuestion.endsWith("?"),
  };
  return {
    evaluator: "qa-review-structural-v1",
    score: Object.values(checks).filter(Boolean).length * 25,
    checks,
  };
}
function createAgentDraft(agentKey: AgentKey, goal: string) {
  return agentKey === "qa-reviewer-v1"
    ? createQaReview(goal)
    : createPlan(goal);
}
function approvalTitle(agentKey: AgentKey) {
  return agentKey === "qa-reviewer-v1"
    ? "QA report requires approval"
    : "Agent plan requires approval";
}
export function evaluateAgentPlan(plan: {
  summary: string;
  milestones: string[];
  risks: string[];
  approvalQuestion: string;
}) {
  const checks = {
    meaningfulSummary: plan.summary.trim().length >= 20,
    actionableMilestones: plan.milestones.length >= 3,
    identifiesRisks: plan.risks.length >= 1,
    explicitApproval: plan.approvalQuestion.trim().endsWith("?"),
  };
  return {
    evaluator: "project-planner-structural-v1",
    score: Object.values(checks).filter(Boolean).length * 25,
    checks,
  };
}
const job = (row: JobRow) => ({
  id: row.id,
  workspaceId: row.workspace_id,
  requestedBy: row.requested_by,
  agentKey: row.agent_key,
  goal: row.goal,
  output: row.output,
  status: row.status,
  phase: row.phase,
  attempt: row.attempt,
  maxAttempts: row.max_attempts,
  errorCode: row.error_code,
  traceId: row.trace_id,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  completedAt: row.completed_at?.toISOString() ?? null,
});
const step = (row: StepRow) => ({
  id: row.id,
  name: row.name,
  status: row.status,
  attempt: row.attempt,
  output: row.output,
  errorCode: row.error_code,
  startedAt: row.started_at.toISOString(),
  completedAt: row.completed_at?.toISOString() ?? null,
});
const artifact = (row: ArtifactRow, content: unknown) => ({
  id: row.id,
  jobId: row.job_id,
  kind: row.kind,
  name: row.name,
  mediaType: row.media_type,
  content,
  storageBackend: row.storage_backend,
  sizeBytes: row.size_bytes,
  checksumSha256: row.checksum_sha256,
  createdAt: row.created_at.toISOString(),
});
