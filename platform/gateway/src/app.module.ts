import { Module } from "@nestjs/common";
import { GatewayController } from "./gateway.controller";
import { WorkspaceProxyController } from "./workspace-proxy.controller";

@Module({ controllers: [GatewayController, WorkspaceProxyController] })
export class AppModule {}
