import { Module } from "@nestjs/common";
import { databaseProviders } from "./database";
import { WorkspaceController } from "./workspace.controller";
import { WorkspaceService } from "./workspace.service";
import { OutboxPublisher } from "./outbox.publisher";

@Module({
  controllers: [WorkspaceController],
  providers: [...databaseProviders, WorkspaceService, OutboxPublisher],
})
export class AppModule {}
