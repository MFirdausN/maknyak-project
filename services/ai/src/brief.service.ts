import {
  BadGatewayException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Pool } from "pg";
import { DATABASE } from "./database";
import { ProviderRegistry } from "./provider";
import type {
  Brief,
  BriefPage,
  BriefResult,
  GenerateBriefInput,
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
        `SELECT id, workspace_id, principal_id, title, idea, model_id, result, created_at
         FROM ai.briefs WHERE workspace_id = $1
         ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
        [workspaceId, pageSize, offset],
      ),
      this.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ai.briefs WHERE workspace_id = $1`,
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
    const run = await this.database.query<{ id: string }>(
      `INSERT INTO ai.runs (workspace_id, principal_id, model_id, prompt_id, status, input_characters)
       VALUES ($1, $2, $3, $4, 'running', $5) RETURNING id`,
      [input.workspaceId, principalId, model.id, prompt.id, input.idea.length],
    );
    const runId = run.rows[0]?.id;
    if (!runId) throw new Error("AI run insert returned no row");
    const started = Date.now();
    try {
      const result = await this.providers
        .provider(model.provider, model.provider_model)
        .generate(input, prompt.template, onChunk);
      const created = await this.database.query<BriefRow>(
        `INSERT INTO ai.briefs (workspace_id, principal_id, title, idea, model_id, prompt_id, result)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING id, workspace_id, principal_id, title, idea, model_id, result, created_at`,
        [
          input.workspaceId,
          principalId,
          input.title,
          input.idea,
          model.id,
          prompt.id,
          JSON.stringify(result),
        ],
      );
      await this.database.query(
        `UPDATE ai.runs SET status = 'succeeded', output_characters = $2, latency_ms = $3, completed_at = now() WHERE id = $1`,
        [runId, JSON.stringify(result).length, Date.now() - started],
      );
      const row = created.rows[0];
      if (!row) throw new Error("Brief insert returned no row");
      return toBrief(row);
    } catch (error) {
      await this.database.query(
        `UPDATE ai.runs SET status = 'failed', latency_ms = $2, error_code = 'provider_error', completed_at = now() WHERE id = $1`,
        [runId, Date.now() - started],
      );
      throw error instanceof Error
        ? new BadGatewayException(error.message)
        : error;
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
    createdAt: row.created_at.toISOString(),
  };
}
