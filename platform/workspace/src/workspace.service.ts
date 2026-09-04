import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { DATABASE } from "./database";
import { requireRole } from "./policy";
import type {
  AuditEvent,
  Membership,
  CreatedInvitation,
  Invitation,
  InvitationStatus,
  Project,
  Workspace,
  WorkspaceRole,
} from "./workspace.types";

interface AuditEventRow {
  id: string;
  principal_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: Date;
}

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
interface MembershipRow {
  principal_id: string;
  role: WorkspaceRole;
  created_at: Date;
}
interface InvitationRow {
  id: string;
  workspace_id: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  status: InvitationStatus;
  invited_by: string;
  expires_at: Date;
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

  async authorize(
    principalId: string,
    workspaceId: string,
    minimumRole: WorkspaceRole,
    projectId?: string,
  ): Promise<{
    workspaceId: string;
    principalId: string;
    role: WorkspaceRole;
  }> {
    const role = await this.role(principalId, workspaceId);
    requireRole(role, minimumRole);
    if (projectId) {
      const project = await this.database.query(
        `SELECT 1 FROM workspace.projects WHERE id = $1 AND workspace_id = $2`,
        [projectId, workspaceId],
      );
      if (project.rowCount !== 1)
        throw new NotFoundException("Project not found in workspace");
    }
    if (!role) throw new NotFoundException("Workspace membership not found");
    return { workspaceId, principalId, role };
  }

  async addMember(
    principalId: string,
    workspaceId: string,
    memberId: string,
    role: WorkspaceRole,
  ): Promise<void> {
    requireRole(await this.role(principalId, workspaceId), "owner");
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO workspace.memberships (workspace_id, principal_id, role)
         VALUES ($1, $2, $3)`,
        [workspaceId, memberId, role],
      );
      await this.audit(
        client,
        workspaceId,
        principalId,
        "member.added",
        "membership",
        memberId,
        { role },
      );
      await this.outbox(client, "workspace.member.added.v1", workspaceId, {
        workspaceId,
        principalId: memberId,
        role,
        addedBy: principalId,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error))
        throw new ConflictException("Principal is already a workspace member");
      throw error;
    } finally {
      client.release();
    }
  }

  async listMembers(
    principalId: string,
    workspaceId: string,
  ): Promise<Membership[]> {
    requireRole(await this.role(principalId, workspaceId), "viewer");
    const result = await this.database.query<MembershipRow>(
      `SELECT principal_id, role, created_at
       FROM workspace.memberships
       WHERE workspace_id = $1
       ORDER BY created_at, principal_id`,
      [workspaceId],
    );
    return result.rows.map(this.toMembership);
  }

  async updateMember(
    principalId: string,
    workspaceId: string,
    memberId: string,
    role: WorkspaceRole,
  ): Promise<Membership> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await this.lockMembershipMutations(client, workspaceId);
      requireRole(
        await this.lockedRole(client, principalId, workspaceId),
        "owner",
      );
      const current = await this.lockedRole(client, memberId, workspaceId);
      if (!current) throw new NotFoundException("Workspace member not found");
      if (current === "owner" && role !== "owner") {
        await this.requireAnotherOwner(client, workspaceId);
      }
      const updated = await client.query<MembershipRow>(
        `UPDATE workspace.memberships SET role = $3
         WHERE workspace_id = $1 AND principal_id = $2
         RETURNING principal_id, role, created_at`,
        [workspaceId, memberId, role],
      );
      const row = updated.rows[0];
      if (!row) throw new NotFoundException("Workspace member not found");
      await this.audit(
        client,
        workspaceId,
        principalId,
        "member.role-changed",
        "membership",
        memberId,
        {
          previousRole: current,
          role,
        },
      );
      await this.outbox(
        client,
        "workspace.member.role-changed.v1",
        workspaceId,
        {
          workspaceId,
          principalId: memberId,
          previousRole: current,
          role,
          changedBy: principalId,
        },
      );
      await client.query("COMMIT");
      return this.toMembership(row);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async removeMember(
    principalId: string,
    workspaceId: string,
    memberId: string,
  ): Promise<void> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await this.lockMembershipMutations(client, workspaceId);
      requireRole(
        await this.lockedRole(client, principalId, workspaceId),
        "owner",
      );
      const current = await this.lockedRole(client, memberId, workspaceId);
      if (!current) throw new NotFoundException("Workspace member not found");
      if (current === "owner")
        await this.requireAnotherOwner(client, workspaceId);
      await client.query(
        `DELETE FROM workspace.memberships WHERE workspace_id = $1 AND principal_id = $2`,
        [workspaceId, memberId],
      );
      await this.audit(
        client,
        workspaceId,
        principalId,
        "member.removed",
        "membership",
        memberId,
        {
          previousRole: current,
        },
      );
      await this.outbox(client, "workspace.member.removed.v1", workspaceId, {
        workspaceId,
        principalId: memberId,
        previousRole: current,
        removedBy: principalId,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listInvitations(
    principalId: string,
    workspaceId: string,
  ): Promise<Invitation[]> {
    requireRole(await this.role(principalId, workspaceId), "admin");
    const result = await this.database.query<InvitationRow>(
      `SELECT id, workspace_id, email, role, status, invited_by, expires_at, created_at
       FROM workspace.invitations WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [workspaceId],
    );
    return result.rows.map(this.toInvitation);
  }

  async createInvitation(
    principalId: string,
    workspaceId: string,
    input: { email: string; role: Exclude<WorkspaceRole, "owner"> },
  ): Promise<CreatedInvitation> {
    requireRole(await this.role(principalId, workspaceId), "admin");
    const email = input.email.trim().toLowerCase();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE workspace.invitations SET status = 'revoked', revoked_at = now()
         WHERE workspace_id = $1 AND email = $2 AND status = 'pending'`,
        [workspaceId, email],
      );
      const created = await client.query<InvitationRow>(
        `INSERT INTO workspace.invitations
         (workspace_id, email, role, token_hash, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
         RETURNING id, workspace_id, email, role, status, invited_by, expires_at, created_at`,
        [workspaceId, email, input.role, tokenHash, principalId],
      );
      const row = created.rows[0];
      if (!row) throw new Error("Invitation insert returned no row");
      await this.audit(
        client,
        workspaceId,
        principalId,
        "member.invited",
        "invitation",
        row.id,
        {
          email,
          role: input.role,
        },
      );
      await this.outbox(client, "workspace.member.invited.v1", workspaceId, {
        invitationId: row.id,
        workspaceId,
        email,
        role: input.role,
        invitedBy: principalId,
      });
      await client.query("COMMIT");
      return { ...this.toInvitation(row), token };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeInvitation(
    principalId: string,
    workspaceId: string,
    invitationId: string,
  ): Promise<void> {
    requireRole(await this.role(principalId, workspaceId), "admin");
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const revoked = await client.query(
        `UPDATE workspace.invitations SET status = 'revoked', revoked_at = now()
         WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
         RETURNING id`,
        [invitationId, workspaceId],
      );
      if (revoked.rowCount !== 1)
        throw new NotFoundException("Pending invitation not found");
      await this.audit(
        client,
        workspaceId,
        principalId,
        "member.invitation-revoked",
        "invitation",
        invitationId,
        {},
      );
      await this.outbox(
        client,
        "workspace.member.invitation-revoked.v1",
        workspaceId,
        {
          invitationId,
          workspaceId,
          revokedBy: principalId,
        },
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async acceptInvitation(
    principalId: string,
    principalEmail: string,
    token: string,
  ): Promise<Membership> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<InvitationRow>(
        `SELECT id, workspace_id, email, role, status, invited_by, expires_at, created_at
         FROM workspace.invitations WHERE token_hash = $1 FOR UPDATE`,
        [hashToken(token)],
      );
      const invitation = result.rows[0];
      if (!invitation || invitation.status !== "pending")
        throw new BadRequestException(
          "Invitation is invalid or no longer pending",
        );
      if (invitation.expires_at.getTime() <= Date.now()) {
        await client.query(
          `UPDATE workspace.invitations SET status = 'expired' WHERE id = $1`,
          [invitation.id],
        );
        await client.query("COMMIT");
        throw new BadRequestException("Invitation has expired");
      }
      if (invitation.email !== principalEmail.toLowerCase())
        throw new BadRequestException(
          "Invitation belongs to another email address",
        );
      const membership = await client.query<MembershipRow>(
        `INSERT INTO workspace.memberships (workspace_id, principal_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, principal_id) DO NOTHING
         RETURNING principal_id, role, created_at`,
        [invitation.workspace_id, principalId, invitation.role],
      );
      const row = membership.rows[0];
      if (!row)
        throw new ConflictException("Principal is already a workspace member");
      await client.query(
        `UPDATE workspace.invitations
         SET status = 'accepted', accepted_by = $2, accepted_at = now()
         WHERE id = $1`,
        [invitation.id, principalId],
      );
      await this.audit(
        client,
        invitation.workspace_id,
        principalId,
        "member.invitation-accepted",
        "invitation",
        invitation.id,
        {
          role: invitation.role,
        },
      );
      await this.outbox(
        client,
        "workspace.member.joined.v1",
        invitation.workspace_id,
        {
          invitationId: invitation.id,
          workspaceId: invitation.workspace_id,
          principalId,
          role: invitation.role,
        },
      );
      await client.query("COMMIT");
      return this.toMembership(row);
    } catch (error) {
      if (!isCommittedInvitationExpiry(error)) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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

  async listAuditEvents(
    principalId: string,
    workspaceId: string,
  ): Promise<AuditEvent[]> {
    requireRole(await this.role(principalId, workspaceId), "admin");
    const result = await this.database.query<AuditEventRow>(
      `SELECT id, principal_id, action, entity_type, entity_id, metadata, occurred_at
       FROM audit.events WHERE workspace_id = $1
       ORDER BY occurred_at DESC, id DESC LIMIT 100`,
      [workspaceId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      principalId: row.principal_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: row.metadata,
      occurredAt: row.occurred_at.toISOString(),
    }));
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

  private async lockedRole(
    client: PoolClient,
    principalId: string,
    workspaceId: string,
  ): Promise<WorkspaceRole | undefined> {
    const result = await client.query<{ role: WorkspaceRole }>(
      `SELECT role FROM workspace.memberships
       WHERE workspace_id = $1 AND principal_id = $2 FOR UPDATE`,
      [workspaceId, principalId],
    );
    return result.rows[0]?.role;
  }

  private async requireAnotherOwner(
    client: PoolClient,
    workspaceId: string,
  ): Promise<void> {
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM workspace.memberships
       WHERE workspace_id = $1 AND role = 'owner'`,
      [workspaceId],
    );
    if (Number(result.rows[0]?.count ?? 0) <= 1) {
      throw new ConflictException("A workspace must retain at least one owner");
    }
  }

  private async lockMembershipMutations(
    client: PoolClient,
    workspaceId: string,
  ): Promise<void> {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      workspaceId,
    ]);
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

  private async audit(
    client: PoolClient,
    workspaceId: string,
    principalId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: object,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit.events
       (workspace_id, principal_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        workspaceId,
        principalId,
        action,
        entityType,
        entityId,
        JSON.stringify(metadata),
      ],
    );
  }

  private readonly toWorkspace = (row: WorkspaceRow): Workspace => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  });

  private readonly toMembership = (row: MembershipRow): Membership => ({
    principalId: row.principal_id,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  });

  private readonly toInvitation = (row: InvitationRow): Invitation => ({
    id: row.id,
    workspaceId: row.workspace_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedBy: row.invited_by,
    expiresAt: row.expires_at.toISOString(),
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

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isCommittedInvitationExpiry(error: unknown): boolean {
  return (
    error instanceof BadRequestException &&
    error.message === "Invitation has expired"
  );
}
