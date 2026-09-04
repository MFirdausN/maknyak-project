import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Query,
  Res,
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

interface StreamResponse {
  status(code: number): StreamResponse;
  setHeader(name: string, value: string): void;
  write(chunk: Uint8Array): void;
  end(): void;
}

@Controller("/ai")
@UseGuards(RateLimitGuard, AuthenticationGuard)
export class AiProxyController {
  private readonly config = gatewayConfigSchema.parse(process.env);

  @Get("/models")
  models(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
  ): Promise<unknown> {
    return this.forward("/models", "GET", principal.id, requestId);
  }

  @Get("/briefs")
  briefs(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Query() query: Record<string, string>,
  ): Promise<unknown> {
    const search = new URLSearchParams(query).toString();
    return this.forward(
      `/briefs${search ? `?${search}` : ""}`,
      "GET",
      principal.id,
      requestId,
    );
  }

  @Post("/briefs")
  generate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    return this.forward("/briefs", "POST", principal.id, requestId, body);
  }

  @Post("/briefs/stream")
  async stream(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Body() body: unknown,
    @Res() output: StreamResponse,
  ): Promise<void> {
    const upstream = await fetch(`${this.config.AI_URL}/api/v1/briefs/stream`, {
      method: "POST",
      headers: this.headers(principal.id, requestId),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!upstream.ok || !upstream.body) {
      const payload = (await upstream.json()) as Record<string, unknown>;
      throw new HttpException(payload, upstream.status);
    }
    output.status(upstream.status);
    output.setHeader("content-type", "text/event-stream; charset=utf-8");
    output.setHeader("cache-control", "no-cache, no-transform");
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        output.write(part.value);
      }
    } finally {
      reader.releaseLock();
      output.end();
    }
  }

  private async forward(
    path: string,
    method: "GET" | "POST",
    principalId: string,
    requestId: string,
    body?: unknown,
  ): Promise<unknown> {
    const response = await fetch(`${this.config.AI_URL}/api/v1${path}`, {
      method,
      headers: this.headers(principalId, requestId),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(120_000),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new HttpException(payload, response.status);
    return payload;
  }

  private headers(principalId: string, requestId: string) {
    return {
      "content-type": "application/json",
      "x-principal-id": principalId,
      "x-internal-api-key": this.config.INTERNAL_API_KEY,
      "x-request-id": requestId,
    };
  }
}
