import { Module } from "@nestjs/common";
import { databaseProviders } from "./database";
import { WorkspaceController } from "./workspace.controller";
import { WorkspaceService } from "./workspace.service";

@Module({
  controllers: [WorkspaceController],
  providers: [...databaseProviders, WorkspaceService],
})
export class AppModule {}
