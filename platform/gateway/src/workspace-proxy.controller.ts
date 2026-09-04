import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { gatewayConfigSchema } from "@maknyak/config";
import {
  AuthenticationGuard,
  CurrentPrincipal,
  CurrentRequestId,
  type AuthenticatedPrincipal,
} from "./auth";
import { RateLimitGuard } from "./rate-limit.guard";

@Controller("/workspaces")
@UseGuards(RateLimitGuard, AuthenticationGuard)
export class WorkspaceProxyController {
  private readonly config = gatewayConfigSchema.parse(process.env);

  @Get()
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
  ): Promise<unknown> {
    return this.forward("", "GET", principal.id, requestId);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return this.forward("", "POST", principal.id, requestId, body);
  }

  @Get("/:workspaceId")
  get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
  ): Promise<unknown> {
    return this.forward(`/${workspaceId}`, "GET", principal.id, requestId);
  }

  @Post("/:workspaceId/members")
  @HttpCode(204)
  async addMember(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
  ): Promise<void> {
    await this.forward(
      `/${workspaceId}/members`,
      "POST",
      principal.id,
      requestId,
      body,
    );
  }

  @Get("/:workspaceId/members")
  members(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
  ): Promise<unknown> {
    return this.forward(
      `/${workspaceId}/members`,
      "GET",
      principal.id,
      requestId,
    );
  }

  @Patch("/:workspaceId/members/:memberId")
  updateMember(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Param("memberId", new ParseUUIDPipe()) memberId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return this.forward(
      `/${workspaceId}/members/${memberId}`,
      "PATCH",
      principal.id,
      requestId,
      body,
    );
  }

  @Delete("/:workspaceId/members/:memberId")
  @HttpCode(204)
  async removeMember(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Param("memberId", new ParseUUIDPipe()) memberId: string,
  ): Promise<void> {
    await this.forward(
      `/${workspaceId}/members/${memberId}`,
      "DELETE",
      principal.id,
      requestId,
    );
  }

  @Get("/:workspaceId/invitations")
  invitations(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
  ): Promise<unknown> {
    return this.forward(
      `/${workspaceId}/invitations`,
      "GET",
      principal.id,
      requestId,
      undefined,
      principal.email,
    );
  }

  @Post("/:workspaceId/invitations")
  invite(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return this.forward(
      `/${workspaceId}/invitations`,
      "POST",
      principal.id,
      requestId,
      body,
      principal.email,
    );
  }

  @Delete("/:workspaceId/invitations/:invitationId")
  @HttpCode(204)
  async revokeInvitation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Param("invitationId", new ParseUUIDPipe()) invitationId: string,
  ): Promise<void> {
    await this.forward(
      `/${workspaceId}/invitations/${invitationId}`,
      "DELETE",
      principal.id,
      requestId,
      undefined,
      principal.email,
    );
  }

  @Post("/invitations/accept")
  acceptInvitation(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return this.forward(
      "/invitations/accept",
      "POST",
      principal.id,
      requestId,
      body,
      principal.email,
      false,
    );
  }

  @Post("/:workspaceId/projects")
  createProject(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return this.forward(
      `/${workspaceId}/projects`,
      "POST",
      principal.id,
      requestId,
      body,
    );
  }

  @Get("/:workspaceId/audit")
  audit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Param("workspaceId", new ParseUUIDPipe()) workspaceId: string,
  ): Promise<unknown> {
    return this.forward(
      `/${workspaceId}/audit`,
      "GET",
      principal.id,
      requestId,
    );
  }

  private async forward(
    path: string,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    principalId: string,
    requestId: string,
    body?: unknown,
    principalEmail?: string,
    workspacePath = true,
  ): Promise<unknown> {
    const response = await fetch(
      `${this.config.WORKSPACE_URL}/api/v1${workspacePath ? "/workspaces" : ""}${path}`,
      {
        method,
        headers: {
          "content-type": "application/json",
          "x-principal-id": principalId,
          "x-internal-api-key": this.config.INTERNAL_API_KEY,
          "x-request-id": requestId,
          ...(principalEmail ? { "x-principal-email": principalEmail } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (response.status === 204) return undefined;
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new HttpException(payload, response.status);
    return payload;
  }
}
