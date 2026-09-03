import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { HealthResponse, ServiceInfo } from "@maknyak/contracts";
import type { Pool } from "pg";
import { z } from "zod";
import { PrincipalId } from "./principal";
import { WorkspaceService } from "./workspace.service";
import type { Project, Workspace } from "./workspace.types";
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
const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

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
