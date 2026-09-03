import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Param,
  ParseUUIDPipe,
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

@Controller("/workspaces")
@UseGuards(AuthenticationGuard)
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

  private async forward(
    path: string,
    method: "GET" | "POST",
    principalId: string,
    requestId: string,
    body?: unknown,
  ): Promise<unknown> {
    const response = await fetch(
      `${this.config.WORKSPACE_URL}/api/v1/workspaces${path}`,
      {
        method,
        headers: {
          "content-type": "application/json",
          "x-principal-id": principalId,
          "x-internal-api-key": this.config.INTERNAL_API_KEY,
          "x-request-id": requestId,
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
