import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { HealthResponse, ServiceInfo } from "@maknyak/contracts";
import type { Pool } from "pg";
import { z } from "zod";
import { PrincipalEmail, PrincipalId } from "./principal";
import { WorkspaceService } from "./workspace.service";
import type {
  AuditEvent,
  CreatedInvitation,
  Invitation,
  Membership,
  Project,
  Workspace,
} from "./workspace.types";
import { DATABASE } from "./database";

const createWorkspaceSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(100),
});
const addMemberSchema = z.object({
  principalId: z.string().uuid(),
  role: z.enum(["admin", "member", "viewer"]),
});
const updateMemberSchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]),
});
const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(100),
});
const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]),
});
const acceptInvitationSchema = z.object({ token: z.string().min(32).max(256) });

export const workspaceInfo: ServiceInfo = {
  name: "workspace",
  domain: "Workspace",
  version: "0.1.0",
  description:
    "Tenant, membership, role, and project boundary for Maknyak Platform.",
};

@Controller()
export class WorkspaceController {
  constructor(
    @Inject(WorkspaceService) private readonly workspaces: WorkspaceService,
    @Inject(DATABASE) private readonly database: Pool,
  ) {}

  @Get()
  info(): ServiceInfo {
    return workspaceInfo;
  }

  @Get("/health")
  health(): HealthResponse {
    return this.liveness();
  }

  @Get("/health/live")
  liveness(): HealthResponse {
    return {
      service: workspaceInfo.name,
      status: "ok",
      version: workspaceInfo.version,
      timestamp: new Date().toISOString(),
    };
  }

  @Get("/health/ready")
  async readiness(): Promise<HealthResponse> {
    try {
      await this.database.query("SELECT 1");
      return this.liveness();
    } catch {
      throw new ServiceUnavailableException({
        ...this.liveness(),
        status: "degraded",
      });
    }
  }

  @Get("/workspaces")
  list(@PrincipalId() principalId: string): Promise<Workspace[]> {
    return this.workspaces.list(principalId);
  }

  @Post("/workspaces")
  create(
    @PrincipalId() principalId: string,
    @Body() body: unknown,
  ): Promise<Workspace> {
    return this.workspaces.create(
      principalId,
      parse(createWorkspaceSchema, body),
    );
  }

  @Get("/workspaces/:workspaceId")
  get(
    @PrincipalId() principalId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
  ): Promise<Workspace> {
    return this.workspaces.get(principalId, workspaceId);
  }

  @Post("/workspaces/:workspaceId/members")
  @HttpCode(204)
  async addMember(
    @PrincipalId() principalId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const input = parse(addMemberSchema, body);
    await this.workspaces.addMember(
      principalId,
      workspaceId,
      input.principalId,
      input.role,
    );
  }

  @Get("/workspaces/:workspaceId/members")
  members(
    @PrincipalId() principalId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
  ): Promise<Membership[]> {
    return this.workspaces.listMembers(principalId, workspaceId);
  }

  @Patch("/workspaces/:workspaceId/members/:memberId")
  updateMember(
    @PrincipalId() principalId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Param("memberId", new ParseUUIDPipe()) memberId: string,
    @Body() body: unknown,
  ): Promise<Membership> {
    const input = parse(updateMemberSchema, body);
    return this.workspaces.updateMember(
      principalId,
      workspaceId,
      memberId,
      input.role,
    );
  }

  @Delete("/workspaces/:workspaceId/members/:memberId")
  @HttpCode(204)
  async removeMember(
    @PrincipalId() principalId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Param("memberId", new ParseUUIDPipe()) memberId: string,
  ): Promise<void> {
    await this.workspaces.removeMember(principalId, workspaceId, memberId);
  }

  @Get("/workspaces/:workspaceId/invitations")
  invitations(
    @PrincipalId() principalId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
  ): Promise<Invitation[]> {
    return this.workspaces.listInvitations(principalId, workspaceId);
  }

  @Post("/workspaces/:workspaceId/invitations")
  invite(
    @PrincipalId() principalId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
  ): Promise<CreatedInvitation> {
    return this.workspaces.createInvitation(
      principalId,
      workspaceId,
      parse(createInvitationSchema, body),
    );
  }

  @Delete("/workspaces/:workspaceId/invitations/:invitationId")
  @HttpCode(204)
  async revokeInvitation(
    @PrincipalId() principalId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Param("invitationId", new ParseUUIDPipe()) invitationId: string,
  ): Promise<void> {
    await this.workspaces.revokeInvitation(
      principalId,
      workspaceId,
      invitationId,
    );
  }

  @Post("/invitations/accept")
  acceptInvitation(
    @PrincipalId() principalId: string,
    @PrincipalEmail() principalEmail: string,
    @Body() body: unknown,
  ): Promise<Membership> {
    return this.workspaces.acceptInvitation(
      principalId,
      principalEmail,
      parse(acceptInvitationSchema, body).token,
    );
  }

  @Post("/workspaces/:workspaceId/projects")
  createProject(
    @PrincipalId() principalId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
  ): Promise<Project> {
    return this.workspaces.createProject(
      principalId,
      workspaceId,
      parse(createProjectSchema, body).name,
    );
  }

  @Get("/workspaces/:workspaceId/audit")
  audit(
    @PrincipalId() principalId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
  ): Promise<AuditEvent[]> {
    return this.workspaces.listAuditEvents(principalId, workspaceId);
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      message: "Validation failed",
      issues: result.error.issues,
    });
  return result.data;
}
