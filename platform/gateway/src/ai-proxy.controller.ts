import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Put,
  Param,
  Query,
  Res,
  UseGuards,
  Headers,
  Delete,
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
    @Headers("traceparent") traceparent?: string,
  ): Promise<unknown> {
    return this.forward(
      "/models",
      "GET",
      principal.id,
      requestId,
      undefined,
      traceparent,
    );
  }

  @Get("/briefs")
  briefs(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Query() query: Record<string, string>,
    @Headers("traceparent") traceparent?: string,
  ): Promise<unknown> {
    const search = new URLSearchParams(query).toString();
    return this.forward(
      `/briefs${search ? `?${search}` : ""}`,
      "GET",
      principal.id,
      requestId,
      undefined,
      traceparent,
    );
  }

  @Post("/briefs")
  generate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Body() body: unknown,
    @Headers("traceparent") traceparent?: string,
  ): Promise<unknown> {
    return this.forward(
      "/briefs",
      "POST",
      principal.id,
      requestId,
      body,
      traceparent,
    );
  }

  @Get("/usage")
  usage(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Query() query: Record<string, string>,
    @Headers("traceparent") traceparent?: string,
  ) {
    const search = new URLSearchParams(query).toString();
    return this.forward(
      `/usage${search ? `?${search}` : ""}`,
      "GET",
      principal.id,
      requestId,
      undefined,
      traceparent,
    );
  }

  @Put("/briefs/:briefId/feedback")
  feedback(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Param("briefId") briefId: string,
    @Body() body: unknown,
    @Headers("traceparent") traceparent?: string,
  ) {
    return this.forward(
      `/briefs/${encodeURIComponent(briefId)}/feedback`,
      "PUT",
      principal.id,
      requestId,
      body,
      traceparent,
    );
  }

  @Post("/briefs/stream")
  async stream(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CurrentRequestId() requestId: string,
    @Body() body: unknown,
    @Res() output: StreamResponse,
    @Headers("traceparent") traceparent?: string,
  ): Promise<void> {
    const upstream = await fetch(`${this.config.AI_URL}/api/v1/briefs/stream`, {
      method: "POST",
      headers: this.headers(principal.id, requestId, traceparent),
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

  @Get("/conversations") conversations(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @CurrentRequestId() r: string,
    @Query() q: Record<string, string>,
    @Headers("traceparent") t?: string,
  ) {
    const search = new URLSearchParams(q).toString();
    return this.forward(
      `/conversations?${search}`,
      "GET",
      p.id,
      r,
      undefined,
      t,
    );
  }
  @Post("/conversations") createConversation(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @CurrentRequestId() r: string,
    @Body() b: unknown,
    @Headers("traceparent") t?: string,
  ) {
    return this.forward("/conversations", "POST", p.id, r, b, t);
  }
  @Get("/conversations/:id/messages") messages(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @CurrentRequestId() r: string,
    @Param("id") id: string,
    @Headers("traceparent") t?: string,
  ) {
    return this.forward(
      `/conversations/${encodeURIComponent(id)}/messages`,
      "GET",
      p.id,
      r,
      undefined,
      t,
    );
  }
  @Post("/conversations/:id/messages") sendMessage(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @CurrentRequestId() r: string,
    @Param("id") id: string,
    @Body() b: unknown,
    @Headers("traceparent") t?: string,
  ) {
    return this.forward(
      `/conversations/${encodeURIComponent(id)}/messages`,
      "POST",
      p.id,
      r,
      b,
      t,
    );
  }
  @Get("/memories") memories(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @CurrentRequestId() r: string,
    @Query() q: Record<string, string>,
    @Headers("traceparent") t?: string,
  ) {
    return this.forward(
      `/memories?${new URLSearchParams(q).toString()}`,
      "GET",
      p.id,
      r,
      undefined,
      t,
    );
  }
  @Put("/memories") remember(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @CurrentRequestId() r: string,
    @Body() b: unknown,
    @Headers("traceparent") t?: string,
  ) {
    return this.forward("/memories", "PUT", p.id, r, b, t);
  }
  @Delete("/memories") forget(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @CurrentRequestId() r: string,
    @Query() q: Record<string, string>,
    @Headers("traceparent") t?: string,
  ) {
    return this.forward(
      `/memories?${new URLSearchParams(q).toString()}`,
      "DELETE",
      p.id,
      r,
      undefined,
      t,
    );
  }
  @Get("/tool-requests") tools(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @CurrentRequestId() r: string,
    @Query() q: Record<string, string>,
    @Headers("traceparent") t?: string,
  ) {
    return this.forward(
      `/tool-requests?${new URLSearchParams(q).toString()}`,
      "GET",
      p.id,
      r,
      undefined,
      t,
    );
  }
  @Post("/tool-requests") requestTool(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @CurrentRequestId() r: string,
    @Body() b: unknown,
    @Headers("traceparent") t?: string,
  ) {
    return this.forward("/tool-requests", "POST", p.id, r, b, t);
  }
  @Post("/tool-requests/:id/:action") toolAction(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @CurrentRequestId() r: string,
    @Param("id") id: string,
    @Param("action") action: string,
    @Headers("traceparent") t?: string,
  ) {
    if (!["approve", "reject", "execute"].includes(action))
      throw new HttpException("Unknown tool action", 404);
    return this.forward(
      `/tool-requests/${encodeURIComponent(id)}/${action}`,
      "POST",
      p.id,
      r,
      {},
      t,
    );
  }

  private async forward(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    principalId: string,
    requestId: string,
    body?: unknown,
    traceparent?: string,
  ): Promise<unknown> {
    const response = await fetch(`${this.config.AI_URL}/api/v1${path}`, {
      method,
      headers: this.headers(principalId, requestId, traceparent),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(120_000),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new HttpException(payload, response.status);
    return payload;
  }

  private headers(
    principalId: string,
    requestId: string,
    traceparent?: string,
  ) {
    return {
      "content-type": "application/json",
      "x-principal-id": principalId,
      "x-internal-api-key": this.config.INTERNAL_API_KEY,
      "x-request-id": requestId,
      ...(traceparent ? { traceparent } : {}),
    };
  }
}
