import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { GovernanceService } from "./governance.service";
import { PrincipalId, TraceId } from "./principal";

const uuid = z.string().uuid();
const workspace = z.object({ workspaceId: uuid });
const paged = workspace.extend({
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
const conversationInput = workspace.extend({
  title: z.string().trim().min(2).max(120),
});
const messageInput = z.object({ content: z.string().trim().min(1).max(12000) });
const memoryInput = workspace.extend({
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(2000),
});
const memoryDelete = workspace.extend({
  key: z.string().trim().min(1).max(80),
});
const toolInput = workspace.extend({
  conversationId: uuid.optional(),
  toolName: z.enum(["conversation.stats", "memory.list"]),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

@Controller()
export class GovernanceController {
  constructor(
    @Inject(GovernanceService) private readonly governance: GovernanceService,
  ) {}
  @Post("/conversations") create(
    @PrincipalId() principal: string,
    @Body() body: unknown,
  ) {
    const input = parse(conversationInput, body);
    return this.governance.createConversation(
      principal,
      input.workspaceId,
      input.title,
    );
  }
  @Get("/conversations") list(
    @PrincipalId() principal: string,
    @Query() query: unknown,
  ) {
    const input = parse(paged, query);
    return this.governance.conversations(
      principal,
      input.workspaceId,
      input.page,
    );
  }
  @Get("/conversations/:id/messages") messages(
    @PrincipalId() principal: string,
    @Param("id") id: string,
  ) {
    return this.governance.messages(principal, parse(uuid, id));
  }
  @Post("/conversations/:id/messages") send(
    @PrincipalId() principal: string,
    @TraceId() traceId: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.governance.sendMessage(
      principal,
      parse(uuid, id),
      parse(messageInput, body).content,
      traceId,
    );
  }
  @Get("/memories") memories(
    @PrincipalId() principal: string,
    @Query() query: unknown,
  ) {
    return this.governance.memories(
      principal,
      parse(workspace, query).workspaceId,
    );
  }
  @Put("/memories") remember(
    @PrincipalId() principal: string,
    @Body() body: unknown,
  ) {
    const input = parse(memoryInput, body);
    return this.governance.remember(
      principal,
      input.workspaceId,
      input.key,
      input.value,
    );
  }
  @Delete("/memories") async forget(
    @PrincipalId() principal: string,
    @Query() query: unknown,
  ) {
    const input = parse(memoryDelete, query);
    await this.governance.forget(principal, input.workspaceId, input.key);
  }
  @Post("/tool-requests") requestTool(
    @PrincipalId() principal: string,
    @TraceId() traceId: string | undefined,
    @Body() body: unknown,
  ) {
    const input = parse(toolInput, body);
    return this.governance.requestTool(
      principal,
      input.workspaceId,
      input.toolName,
      input.arguments,
      input.conversationId,
      traceId,
    );
  }
  @Get("/tool-requests") tools(
    @PrincipalId() principal: string,
    @Query() query: unknown,
  ) {
    return this.governance.tools(
      principal,
      parse(workspace, query).workspaceId,
    );
  }
  @Post("/tool-requests/:id/approve") approve(
    @PrincipalId() principal: string,
    @Param("id") id: string,
  ) {
    return this.governance.decideTool(principal, parse(uuid, id), "approved");
  }
  @Post("/tool-requests/:id/reject") reject(
    @PrincipalId() principal: string,
    @Param("id") id: string,
  ) {
    return this.governance.decideTool(principal, parse(uuid, id), "rejected");
  }
  @Post("/tool-requests/:id/execute") execute(
    @PrincipalId() principal: string,
    @Param("id") id: string,
  ) {
    return this.governance.executeTool(principal, parse(uuid, id));
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
