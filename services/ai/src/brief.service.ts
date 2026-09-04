import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Pool } from "pg";
import { DATABASE } from "./database";
import { ProviderRegistry } from "./provider";
import { evaluateBrief } from "./evaluation";
import type {
  Brief,
  BriefPage,
  BriefResult,
  GenerateBriefInput,
  UsageSummary,
} from "./brief.types";

interface ModelRow {
  id: string;
  provider: string;
  provider_model: string;
  display_name: string;
}
interface PromptRow {
  id: string;
  template: string;
}
interface BriefRow {
  id: string;
  workspace_id: string;
  principal_id: string;
  title: string;
  idea: string;
  model_id: string;
  result: BriefResult;
  evaluation: Brief["evaluation"];
  feedback: Brief["feedback"];
  created_at: Date;
}

@Injectable()
export class BriefService {
  constructor(
    @Inject(DATABASE) private readonly database: Pool,
    @Inject(ProviderRegistry) private readonly providers: ProviderRegistry,
  ) {}

  async models(): Promise<
    Array<{ id: string; displayName: string; provider: string }>
  > {
    const result = await this.database.query<ModelRow>(
      `SELECT id, provider, provider_model, display_name FROM ai.models WHERE enabled ORDER BY id`,
    );
    return result.rows
      .filter(
        (row) =>
          row.provider !== "ollama" || process.env.AI_ENABLE_OLLAMA === "true",
      )
      .map((row) => ({
        id: row.id,
        displayName: row.display_name,
        provider: row.provider,
      }));
  }

  async list(
    principalId: string,
    workspaceId: string,
    page: number,
  ): Promise<BriefPage> {
    await this.authorize(principalId, workspaceId, "viewer");
    const pageSize = 10;
    const offset = (page - 1) * pageSize;
    const [rows, count] = await Promise.all([
      this.database.query<BriefRow>(
        `SELECT b.id, b.workspace_id, b.principal_id, b.title, b.idea, b.model_id,
                b.result, b.evaluation, b.created_at,
                CASE WHEN f.rating IS NULL THEN NULL ELSE jsonb_build_object(
                  'rating', f.rating, 'comment', f.comment, 'updatedAt', f.updated_at
                ) END AS feedback
         FROM ai.briefs b
         LEFT JOIN ai.brief_feedback f ON f.brief_id = b.id AND f.principal_id = $4
         WHERE b.workspace_id = $1 AND b.expires_at > now()
         ORDER BY b.created_at DESC, b.id DESC LIMIT $2 OFFSET $3`,
        [workspaceId, pageSize, offset, principalId],
      ),
      this.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ai.briefs WHERE workspace_id = $1 AND expires_at > now()`,
        [workspaceId],
      ),
    ]);
    const total = Number(count.rows[0]?.count ?? 0);
    return {
      items: rows.rows.map(toBrief),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async usage(principalId: string, workspaceId: string): Promise<UsageSummary> {
    await this.authorize(principalId, workspaceId, "viewer");
    const result = await this.database.query<{
      runs_today: string;
      running: string;
      daily_run_limit: number;
      max_concurrent_runs: number;
      retention_days: number;
    }>(
      `SELECT
        count(r.id) FILTER (WHERE r.created_at >= date_trunc('day', now()))::text AS runs_today,
        count(r.id) FILTER (WHERE r.status = 'running' AND r.created_at > now() - interval '5 minutes')::text AS running,
        COALESCE(l.daily_run_limit, 50) AS daily_run_limit,
        COALESCE(l.max_concurrent_runs, 2) AS max_concurrent_runs,
        COALESCE(l.retention_days, 90) AS retention_days
      FROM (SELECT $1::uuid AS workspace_id) w
      LEFT JOIN ai.workspace_limits l USING (workspace_id)
      LEFT JOIN ai.runs r USING (workspace_id)
      GROUP BY l.daily_run_limit, l.max_concurrent_runs, l.retention_days`,
      [workspaceId],
    );
    const row = result.rows[0]!;
    return {
      runsToday: Number(row.runs_today),
      dailyRunLimit: row.daily_run_limit,
      running: Number(row.running),
      maxConcurrentRuns: row.max_concurrent_runs,
      retentionDays: row.retention_days,
    };
  }

  async feedback(
    principalId: string,
    briefId: string,
    rating: number,
    comment?: string,
  ) {
    const brief = await this.database.query<{ workspace_id: string }>(
      `SELECT workspace_id FROM ai.briefs WHERE id = $1 AND expires_at > now()`,
      [briefId],
    );
    const workspaceId = brief.rows[0]?.workspace_id;
    if (!workspaceId) throw new NotFoundException("AI brief not found");
    await this.authorize(principalId, workspaceId, "viewer");
    const result = await this.database.query<{
      rating: number;
      comment: string | null;
      updated_at: Date;
    }>(
      `INSERT INTO ai.brief_feedback (brief_id, workspace_id, principal_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (brief_id, principal_id) DO UPDATE SET rating = EXCLUDED.rating,
         comment = EXCLUDED.comment, updated_at = now()
       RETURNING rating, comment, updated_at`,
      [briefId, workspaceId, principalId, rating, comment ?? null],
    );
    const row = result.rows[0]!;
    return {
      rating: row.rating,
      ...(row.comment ? { comment: row.comment } : {}),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async generate(
    principalId: string,
    input: GenerateBriefInput,
    onChunk?: (chunk: string) => void,
  ): Promise<Brief> {
    await this.authorize(
      principalId,
      input.workspaceId,
      "member",
      input.projectId,
    );
    const modelResult = await this.database.query<ModelRow>(
      `SELECT id, provider, provider_model, display_name FROM ai.models WHERE id = $1 AND enabled`,
      [input.modelId],
    );
    const model = modelResult.rows[0];
    if (!model) throw new NotFoundException("AI model not found");
    const promptResult = await this.database.query<PromptRow>(
      `SELECT id, template FROM ai.prompts WHERE key = 'project-brief' AND active`,
    );
    const prompt = promptResult.rows[0];
    if (!prompt)
      throw new NotFoundException("Active project brief prompt not found");
    const run = await this.reserveRun(
      input.workspaceId,
      principalId,
      model.id,
      prompt.id,
      input.idea.length,
    );
    const runId = run.id;
    if (!runId) throw new Error("AI run insert returned no row");
    const started = Date.now();
    try {
      const result = await this.providers
        .provider(model.provider, model.provider_model)
        .generate(input, prompt.template, onChunk);
      const evaluation = evaluateBrief(result);
      const created = await this.database.query<BriefRow>(
        `INSERT INTO ai.briefs (workspace_id, principal_id, title, idea, model_id, prompt_id, result, evaluation, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb,
           now() + make_interval(days => $9))
         RETURNING id, workspace_id, principal_id, title, idea, model_id, result, evaluation, NULL::jsonb AS feedback, created_at`,
        [
          input.workspaceId,
          principalId,
          input.title,
          input.idea,
          model.id,
          prompt.id,
          JSON.stringify(result),
          JSON.stringify(evaluation),
          run.retentionDays,
        ],
      );
      await this.database.query(
        `UPDATE ai.runs SET status = 'succeeded', output_characters = $2, latency_ms = $3,
          evaluation = $4::jsonb, completed_at = now() WHERE id = $1`,
        [
          runId,
          JSON.stringify(result).length,
          Date.now() - started,
          JSON.stringify(evaluation),
        ],
      );
      const row = created.rows[0];
      if (!row) throw new Error("Brief insert returned no row");
      return toBrief(row);
    } catch (error) {
      await this.database.query(
        `UPDATE ai.runs SET status = 'failed', latency_ms = $2, error_code = 'provider_error', completed_at = now() WHERE id = $1`,
        [runId, Date.now() - started],
      );
      if (error instanceof HttpException) throw error;
      throw error instanceof Error
        ? new BadGatewayException(error.message)
        : error;
    }
  }

  private async reserveRun(
    workspaceId: string,
    principalId: string,
    modelId: string,
    promptId: string,
    inputCharacters: number,
  ) {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        workspaceId,
      ]);
      await client.query(
        `UPDATE ai.runs SET status = 'failed', error_code = 'timeout', completed_at = now()
        WHERE workspace_id = $1 AND status = 'running' AND created_at <= now() - interval '5 minutes'`,
        [workspaceId],
      );
      const limit = await client.query<{
        daily_run_limit: number;
        max_concurrent_runs: number;
        retention_days: number;
      }>(
        `SELECT COALESCE(daily_run_limit, 50) AS daily_run_limit,
          COALESCE(max_concurrent_runs, 2) AS max_concurrent_runs,
          COALESCE(retention_days, 90) AS retention_days
         FROM (SELECT $1::uuid AS workspace_id) w LEFT JOIN ai.workspace_limits USING (workspace_id)`,
        [workspaceId],
      );
      const usage = await client.query<{ today: string; running: string }>(
        `SELECT count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::text AS today,
          count(*) FILTER (WHERE status = 'running')::text AS running FROM ai.runs WHERE workspace_id = $1`,
        [workspaceId],
      );
      const limits = limit.rows[0]!;
      if (Number(usage.rows[0]!.today) >= limits.daily_run_limit)
        throw new HttpException("Daily AI generation limit reached", 429);
      if (Number(usage.rows[0]!.running) >= limits.max_concurrent_runs)
        throw new HttpException("Too many concurrent AI generations", 429);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO ai.runs (workspace_id, principal_id, model_id, prompt_id, status, input_characters, expires_at)
         VALUES ($1, $2, $3, $4, 'running', $5, now() + make_interval(days => $6)) RETURNING id`,
        [
          workspaceId,
          principalId,
          modelId,
          promptId,
          inputCharacters,
          limits.retention_days,
        ],
      );
      await client.query("COMMIT");
      return { id: inserted.rows[0]!.id, retentionDays: limits.retention_days };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async authorize(
    principalId: string,
    workspaceId: string,
    minimumRole: string,
    projectId?: string,
  ): Promise<void> {
    const response = await fetch(
      `${process.env.WORKSPACE_URL ?? "http://workspace:3002"}/api/v1/internal/authorize`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-api-key": process.env.INTERNAL_API_KEY ?? "",
          "x-principal-id": principalId,
        },
        body: JSON.stringify({
          workspaceId,
          minimumRole,
          ...(projectId ? { projectId } : {}),
        }),
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
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
  }
}

function toBrief(row: BriefRow): Brief {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    principalId: row.principal_id,
    title: row.title,
    idea: row.idea,
    modelId: row.model_id,
    result: row.result,
    evaluation: row.evaluation,
    feedback: row.feedback,
    createdAt: row.created_at.toISOString(),
  };
}
