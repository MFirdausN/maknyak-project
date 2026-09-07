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
import { estimateTokens } from "./provider";

interface ConversationRow {
  id: string;
  workspace_id: string;
  principal_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}
interface MessageRow {
  id: string;
  conversation_id: string;
  principal_id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  input_tokens: number;
  output_tokens: number;
  created_at: Date;
}
interface MemoryRow {
  id: string;
  key: string;
  value: string;
  updated_at: Date;
}
interface ToolRow {
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  requested_by: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  status: string;
  approved_by: string | null;
  output: unknown;
  created_at: Date;
}

@Injectable()
export class GovernanceService {
  constructor(@Inject(DATABASE) private readonly database: Pool) {}

  async createConversation(
    principalId: string,
    workspaceId: string,
    title: string,
  ) {
    await this.authorize(principalId, workspaceId, "member");
    const retention = await this.retentionDays(workspaceId);
    const result = await this.database.query<ConversationRow>(
      `INSERT INTO ai.conversations (workspace_id, principal_id, title, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(days => $4)) RETURNING *`,
      [workspaceId, principalId, title, retention],
    );
    return conversation(result.rows[0]!);
  }

  async conversations(principalId: string, workspaceId: string, page: number) {
    await this.authorize(principalId, workspaceId, "viewer");
    const pageSize = 10;
    const [rows, count] = await Promise.all([
      this.database.query<ConversationRow>(
        `SELECT * FROM ai.conversations WHERE workspace_id = $1 AND expires_at > now()
         ORDER BY updated_at DESC, id DESC LIMIT $2 OFFSET $3`,
        [workspaceId, pageSize, (page - 1) * pageSize],
      ),
      this.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ai.conversations WHERE workspace_id = $1 AND expires_at > now()`,
        [workspaceId],
      ),
    ]);
    const total = Number(count.rows[0]?.count ?? 0);
    return {
      items: rows.rows.map(conversation),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async messages(principalId: string, conversationId: string) {
    const workspaceId = await this.conversationWorkspace(conversationId);
    await this.authorize(principalId, workspaceId, "viewer");
    const rows = await this.database.query<MessageRow>(
      `SELECT * FROM ai.messages WHERE conversation_id = $1 ORDER BY created_at, id LIMIT 200`,
      [conversationId],
    );
    return rows.rows.map(message);
  }

  async sendMessage(
    principalId: string,
    conversationId: string,
    content: string,
    traceId?: string,
  ) {
    const workspaceId = await this.conversationWorkspace(conversationId);
    await this.authorize(principalId, workspaceId, "member");
    const memories = await this.database.query<MemoryRow>(
      `SELECT id, key, value, updated_at FROM ai.memories
       WHERE workspace_id = $1 AND principal_id = $2 AND expires_at > now()
       ORDER BY updated_at DESC LIMIT 10`,
      [workspaceId, principalId],
    );
    const context = memories.rows
      .map((row) => `${row.key}: ${row.value}`)
      .join("; ");
    const reply = context
      ? `Saya mengingat konteks berikut: ${context}. Untuk pesan Anda: ${content}`
      : `Saya menerima pesan Anda: ${content}`;
    const inputTokens = estimateTokens(content + context);
    const outputTokens = estimateTokens(reply);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        workspaceId,
      ]);
      const budget = await client.query<{
        tokens: string;
        daily_token_limit: number;
      }>(
        `SELECT
          ((SELECT COALESCE(sum(input_tokens + output_tokens), 0) FROM ai.runs WHERE workspace_id = $1 AND created_at >= date_trunc('day', now()))
          + (SELECT COALESCE(sum(input_tokens + output_tokens), 0) FROM ai.messages WHERE workspace_id = $1 AND created_at >= date_trunc('day', now())))::text AS tokens,
          COALESCE((SELECT daily_token_limit FROM ai.workspace_limits WHERE workspace_id = $1), 100000) AS daily_token_limit`,
        [workspaceId],
      );
      if (
        Number(budget.rows[0]!.tokens) + inputTokens + outputTokens >
        budget.rows[0]!.daily_token_limit
      )
        throw new HttpException("Daily AI token limit reached", 429);
      const user = await client.query<MessageRow>(
        `INSERT INTO ai.messages (conversation_id, workspace_id, principal_id, role, content, input_tokens, trace_id)
         VALUES ($1, $2, $3, 'user', $4, $5, $6) RETURNING *`,
        [
          conversationId,
          workspaceId,
          principalId,
          content,
          inputTokens,
          traceId ?? null,
        ],
      );
      const assistant = await client.query<MessageRow>(
        `INSERT INTO ai.messages (conversation_id, workspace_id, principal_id, role, content, output_tokens, trace_id)
         VALUES ($1, $2, $3, 'assistant', $4, $5, $6) RETURNING *`,
        [
          conversationId,
          workspaceId,
          principalId,
          reply,
          outputTokens,
          traceId ?? null,
        ],
      );
      await client.query(
        `UPDATE ai.conversations SET updated_at = now() WHERE id = $1`,
        [conversationId],
      );
      await client.query("COMMIT");
      return {
        user: message(user.rows[0]!),
        assistant: message(assistant.rows[0]!),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async memories(principalId: string, workspaceId: string) {
    await this.authorize(principalId, workspaceId, "viewer");
    const rows = await this.database.query<MemoryRow>(
      `SELECT id, key, value, updated_at FROM ai.memories WHERE workspace_id = $1
       AND principal_id = $2 AND expires_at > now() ORDER BY key`,
      [workspaceId, principalId],
    );
    return rows.rows.map(memory);
  }

  async remember(
    principalId: string,
    workspaceId: string,
    key: string,
    value: string,
  ) {
    await this.authorize(principalId, workspaceId, "member");
    const retention = await this.retentionDays(workspaceId);
    const result = await this.database.query<MemoryRow>(
      `INSERT INTO ai.memories (workspace_id, principal_id, key, value, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))
       ON CONFLICT (workspace_id, principal_id, key) DO UPDATE SET value = EXCLUDED.value,
         updated_at = now(), expires_at = EXCLUDED.expires_at RETURNING id, key, value, updated_at`,
      [workspaceId, principalId, key, value, retention],
    );
    return memory(result.rows[0]!);
  }

  async forget(principalId: string, workspaceId: string, key: string) {
    await this.authorize(principalId, workspaceId, "member");
    const result = await this.database.query(
      `DELETE FROM ai.memories WHERE workspace_id = $1 AND principal_id = $2 AND key = $3`,
      [workspaceId, principalId, key],
    );
    if (result.rowCount === 0)
      throw new NotFoundException("AI memory not found");
  }

  async requestTool(
    principalId: string,
    workspaceId: string,
    toolName: string,
    args: Record<string, unknown>,
    conversationId?: string,
    traceId?: string,
  ) {
    await this.authorize(principalId, workspaceId, "member");
    if (
      conversationId &&
      (await this.conversationWorkspace(conversationId)) !== workspaceId
    )
      throw new ForbiddenException("Conversation belongs to another workspace");
    const retention = await this.retentionDays(workspaceId);
    const result = await this.database.query<ToolRow>(
      `INSERT INTO ai.tool_requests (workspace_id, conversation_id, requested_by, tool_name, arguments, trace_id, expires_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, now() + make_interval(days => $7)) RETURNING *`,
      [
        workspaceId,
        conversationId ?? null,
        principalId,
        toolName,
        JSON.stringify(args),
        traceId ?? null,
        retention,
      ],
    );
    return tool(result.rows[0]!);
  }

  async tools(principalId: string, workspaceId: string) {
    await this.authorize(principalId, workspaceId, "viewer");
    const rows = await this.database.query<ToolRow>(
      `SELECT * FROM ai.tool_requests WHERE workspace_id = $1 AND expires_at > now()
       ORDER BY created_at DESC, id DESC LIMIT 100`,
      [workspaceId],
    );
    return rows.rows.map(tool);
  }

  async decideTool(
    principalId: string,
    requestId: string,
    decision: "approved" | "rejected",
  ) {
    const request = await this.toolRequest(requestId);
    await this.authorize(principalId, request.workspace_id, "admin");
    const result = await this.database.query<ToolRow>(
      `UPDATE ai.tool_requests SET status = $2, approved_by = $3, decided_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [requestId, decision, principalId],
    );
    if (!result.rows[0])
      throw new ForbiddenException("Tool request is no longer pending");
    return tool(result.rows[0]);
  }

  async executeTool(principalId: string, requestId: string) {
    const request = await this.toolRequest(requestId);
    await this.authorize(principalId, request.workspace_id, "member");
    if (request.status !== "approved")
      throw new ForbiddenException("Tool request requires approval");
    let output: unknown;
    if (request.tool_name === "conversation.stats") {
      if (!request.conversation_id)
        throw new ForbiddenException("conversationId is required");
      const result = await this.database.query<{ messages: string }>(
        `SELECT count(*)::text AS messages FROM ai.messages WHERE workspace_id = $1 AND conversation_id = $2`,
        [request.workspace_id, request.conversation_id],
      );
      output = { messages: Number(result.rows[0]?.messages ?? 0) };
    } else if (request.tool_name === "memory.list") {
      const result = await this.database.query<MemoryRow>(
        `SELECT id, key, value, updated_at FROM ai.memories WHERE workspace_id = $1
         AND principal_id = $2 AND expires_at > now() ORDER BY key`,
        [request.workspace_id, request.requested_by],
      );
      output = { memories: result.rows.map(memory) };
    } else throw new ForbiddenException("Tool is not allowlisted");
    const updated = await this.database.query<ToolRow>(
      `UPDATE ai.tool_requests SET status = 'succeeded', output = $2::jsonb, executed_at = now()
       WHERE id = $1 AND status = 'approved' RETURNING *`,
      [requestId, JSON.stringify(output)],
    );
    if (!updated.rows[0])
      throw new ForbiddenException("Tool request cannot be executed");
    return tool(updated.rows[0]);
  }

  private async conversationWorkspace(id: string) {
    const result = await this.database.query<{ workspace_id: string }>(
      `SELECT workspace_id FROM ai.conversations WHERE id = $1 AND expires_at > now()`,
      [id],
    );
    if (!result.rows[0])
      throw new NotFoundException("AI conversation not found");
    return result.rows[0].workspace_id;
  }
  private async toolRequest(id: string) {
    const result = await this.database.query<ToolRow>(
      `SELECT * FROM ai.tool_requests WHERE id = $1 AND expires_at > now()`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException("Tool request not found");
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
  ) {
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

const conversation = (row: ConversationRow) => ({
  id: row.id,
  workspaceId: row.workspace_id,
  principalId: row.principal_id,
  title: row.title,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});
const message = (row: MessageRow) => ({
  id: row.id,
  conversationId: row.conversation_id,
  principalId: row.principal_id,
  role: row.role,
  content: row.content,
  inputTokens: row.input_tokens,
  outputTokens: row.output_tokens,
  createdAt: row.created_at.toISOString(),
});
const memory = (row: MemoryRow) => ({
  id: row.id,
  key: row.key,
  value: row.value,
  updatedAt: row.updated_at.toISOString(),
});
const tool = (row: ToolRow) => ({
  id: row.id,
  workspaceId: row.workspace_id,
  conversationId: row.conversation_id,
  requestedBy: row.requested_by,
  toolName: row.tool_name,
  arguments: row.arguments,
  status: row.status,
  approvedBy: row.approved_by,
  output: row.output,
  createdAt: row.created_at.toISOString(),
});
