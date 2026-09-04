import { Module } from "@nestjs/common";
import { GatewayController } from "./gateway.controller";
import { WorkspaceProxyController } from "./workspace-proxy.controller";
import { RateLimitGuard } from "./rate-limit.guard";
import { AiProxyController } from "./ai-proxy.controller";

@Module({
  controllers: [GatewayController, WorkspaceProxyController, AiProxyController],
  providers: [RateLimitGuard],
})
export class AppModule {}
