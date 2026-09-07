import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { AgentService } from "./agent.service";
import { PrincipalId, TraceId } from "./principal";

const uuid = z.string().uuid();
const createSchema = z.object({
  workspaceId: uuid,
  goal: z.string().trim().min(20).max(4000),
  agentKey: z.literal("project-planner-v1").default("project-planner-v1"),
});
const listSchema = z.object({
  workspaceId: uuid,
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
const decisionSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

@Controller("/agent-jobs")
export class AgentController {
  constructor(@Inject(AgentService) private readonly agents: AgentService) {}
  @Post()
  create(
    @PrincipalId() principal: string,
    @TraceId() traceId: string | undefined,
    @Body() body: unknown,
  ) {
    const input = parse(createSchema, body);
    return this.agents.create(
      principal,
      input.workspaceId,
      input.goal,
      traceId,
    );
  }
  @Get()
  list(@PrincipalId() principal: string, @Query() query: unknown) {
    const input = parse(listSchema, query);
    return this.agents.list(principal, input.workspaceId, input.page);
  }
  @Get("operations")
  operations(
    @PrincipalId() principal: string,
    @Query("workspaceId") workspaceId: string,
  ) {
    return this.agents.operations(principal, parse(uuid, workspaceId));
  }
  @Get("notifications")
  notifications(
    @PrincipalId() principal: string,
    @Query("workspaceId") workspaceId: string,
  ) {
    return this.agents.notifications(principal, parse(uuid, workspaceId));
  }
  @Post("notifications/:id/read")
  readNotification(@PrincipalId() principal: string, @Param("id") id: string) {
    return this.agents.readNotification(principal, parse(uuid, id));
  }
  @Get(":id")
  detail(@PrincipalId() principal: string, @Param("id") id: string) {
    return this.agents.detail(principal, parse(uuid, id));
  }
  @Post(":id/approve")
  approve(
    @PrincipalId() principal: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.agents.decide(
      principal,
      parse(uuid, id),
      "approved",
      parse(decisionSchema, body).note,
    );
  }
  @Post(":id/reject")
  reject(
    @PrincipalId() principal: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.agents.decide(
      principal,
      parse(uuid, id),
      "rejected",
      parse(decisionSchema, body).note,
    );
  }
  @Post(":id/cancel")
  cancel(@PrincipalId() principal: string, @Param("id") id: string) {
    return this.agents.cancel(principal, parse(uuid, id));
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
