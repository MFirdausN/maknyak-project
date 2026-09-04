import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Put,
  Param,
  Query,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { HealthResponse, ServiceInfo } from "@maknyak/contracts";
import type { Pool } from "pg";
import { z } from "zod";
import { BriefService } from "./brief.service";
import type { Brief, BriefPage } from "./brief.types";
import { DATABASE } from "./database";
import { PrincipalId } from "./principal";

const generateSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(120),
  idea: z.string().trim().min(20).max(8_000),
  modelId: z.string().min(1).max(100).default("brief-local-v1"),
});
const listSchema = z.object({
  workspaceId: z.string().uuid(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
const idSchema = z.string().uuid();

interface StreamResponse {
  status(code: number): StreamResponse;
  setHeader(name: string, value: string): void;
  flushHeaders(): void;
  write(chunk: string): void;
  end(): void;
}

export const aiInfo: ServiceInfo = {
  name: "ai",
  domain: "AI",
  version: "0.1.0",
  description: "Tenant-scoped AI project brief generation and usage tracking.",
};

@Controller()
export class BriefController {
  constructor(
    @Inject(BriefService) private readonly briefs: BriefService,
    @Inject(DATABASE) private readonly database: Pool,
  ) {}

  @Get()
  info(): ServiceInfo {
    return aiInfo;
  }

  @Get("/health/live")
  liveness(): HealthResponse {
    return {
      service: aiInfo.name,
      status: "ok",
      version: aiInfo.version,
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

  @Get("/models")
  models(@PrincipalId() principalId: string) {
    void principalId;
    return this.briefs.models();
  }

  @Get("/briefs")
  list(
    @PrincipalId() principalId: string,
    @Query() query: unknown,
  ): Promise<BriefPage> {
    const input = parse(listSchema, query);
    return this.briefs.list(principalId, input.workspaceId, input.page);
  }

  @Post("/briefs")
  generate(
    @PrincipalId() principalId: string,
    @Body() body: unknown,
  ): Promise<Brief> {
    return this.briefs.generate(principalId, parse(generateSchema, body));
  }

  @Get("/usage")
  usage(@PrincipalId() principalId: string, @Query() query: unknown) {
    const input = parse(listSchema.pick({ workspaceId: true }), query);
    return this.briefs.usage(principalId, input.workspaceId);
  }

  @Put("/briefs/:briefId/feedback")
  feedback(
    @PrincipalId() principalId: string,
    @Param("briefId") briefId: string,
    @Body() body: unknown,
  ) {
    const input = parse(feedbackSchema, body);
    return this.briefs.feedback(
      principalId,
      parse(idSchema, briefId),
      input.rating,
      input.comment,
    );
  }

  @Post("/briefs/stream")
  async stream(
    @PrincipalId() principalId: string,
    @Body() body: unknown,
    @Res() response: StreamResponse,
  ): Promise<void> {
    const input = parse(generateSchema, body);
    response.status(200);
    response.setHeader("content-type", "text/event-stream; charset=utf-8");
    response.setHeader("cache-control", "no-cache, no-transform");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();
    try {
      const brief = await this.briefs.generate(principalId, input, (chunk) => {
        response.write(`event: token\ndata: ${JSON.stringify(chunk)}\n\n`);
      });
      response.write(`event: result\ndata: ${JSON.stringify(brief)}\n\n`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Generation failed";
      response.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    } finally {
      response.end();
    }
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
