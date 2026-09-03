import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { DATABASE } from "./database";
import { requireRole } from "./policy";
import type { Project, Workspace, WorkspaceRole } from "./workspace.types";

interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
  created_at: Date;
}
interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  created_at: Date;
}

@Injectable()
export class WorkspaceService {
  constructor(@Inject(DATABASE) private readonly database: Pool) {}

  async list(principalId: string): Promise<Workspace[]> {
    const result = await this.database.query<WorkspaceRow>(
      `SELECT w.id, w.slug, w.name, m.role, w.created_at
       FROM workspace.workspaces w
       JOIN workspace.memberships m ON m.workspace_id = w.id
       WHERE m.principal_id = $1 ORDER BY w.created_at DESC`,
      [principalId],
    );
    return result.rows.map(this.toWorkspace);
  }

  async create(
    principalId: string,
    input: { slug: string; name: string },
  ): Promise<Workspace> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query<WorkspaceRow>(
        `INSERT INTO workspace.workspaces (slug, name, created_by)
         VALUES ($1, $2, $3) RETURNING id, slug, name, 'owner'::text AS role, created_at`,
        [input.slug, input.name, principalId],
      );
      const row = created.rows[0];
      if (!row) throw new Error("Workspace insert returned no row");
      await client.query(
        `INSERT INTO workspace.memberships (workspace_id, principal_id, role) VALUES ($1, $2, 'owner')`,
        [row.id, principalId],
      );
      await this.outbox(client, "workspace.workspace.created.v1", row.id, {
        workspaceId: row.id,
        slug: row.slug,
        createdBy: principalId,
      });
      await client.query("COMMIT");
      return this.toWorkspace(row);
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error))
        throw new ConflictException("Workspace slug already exists");
      throw error;
    } finally {
      client.release();
    }
  }

  async get(principalId: string, workspaceId: string): Promise<Workspace> {
    const result = await this.database.query<WorkspaceRow>(
      `SELECT w.id, w.slug, w.name, m.role, w.created_at
       FROM workspace.workspaces w JOIN workspace.memberships m ON m.workspace_id = w.id
       WHERE w.id = $1 AND m.principal_id = $2`,
      [workspaceId, principalId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException("Workspace not found");
    return this.toWorkspace(row);
  }

  async addMember(
    principalId: string,
    workspaceId: string,
    memberId: string,
    role: WorkspaceRole,
  ): Promise<void> {
    requireRole(await this.role(principalId, workspaceId), "admin");
    await this.database.query(
      `INSERT INTO workspace.memberships (workspace_id, principal_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, principal_id) DO UPDATE SET role = EXCLUDED.role`,
      [workspaceId, memberId, role],
    );
  }

  async createProject(
    principalId: string,
    workspaceId: string,
    name: string,
  ): Promise<Project> {
    requireRole(await this.role(principalId, workspaceId), "member");
    const result = await this.database.query<ProjectRow>(
      `INSERT INTO workspace.projects (workspace_id, name, created_by)
       VALUES ($1, $2, $3) RETURNING id, workspace_id, name, created_at`,
      [workspaceId, name, principalId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Project insert returned no row");
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      createdAt: row.created_at.toISOString(),
    };
  }

  private async role(
    principalId: string,
    workspaceId: string,
  ): Promise<WorkspaceRole | undefined> {
    const result = await this.database.query<{ role: WorkspaceRole }>(
      `SELECT role FROM workspace.memberships WHERE workspace_id = $1 AND principal_id = $2`,
      [workspaceId, principalId],
    );
    return result.rows[0]?.role;
  }

  private async outbox(
    client: PoolClient,
    subject: string,
    aggregateId: string,
    payload: object,
  ): Promise<void> {
    await client.query(
      `INSERT INTO workspace.outbox (subject, aggregate_id, payload) VALUES ($1, $2, $3::jsonb)`,
      [subject, aggregateId, JSON.stringify(payload)],
    );
  }

  private readonly toWorkspace = (row: WorkspaceRow): Workspace => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  });
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
