import { Module } from "@nestjs/common";
import { GatewayController } from "./gateway.controller";
import { WorkspaceProxyController } from "./workspace-proxy.controller";
import { RateLimitGuard } from "./rate-limit.guard";

@Module({
  controllers: [GatewayController, WorkspaceProxyController],
  providers: [RateLimitGuard],
})
export class AppModule {}
