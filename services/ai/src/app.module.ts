import { Module } from "@nestjs/common";
import { BriefController } from "./brief.controller";
import { BriefService } from "./brief.service";
import { databaseProviders } from "./database";
import { ProviderRegistry } from "./provider";
import { RetentionService } from "./retention.service";
import { GovernanceController } from "./governance.controller";
import { GovernanceService } from "./governance.service";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { AgentWorker } from "./agent.worker";

@Module({
  controllers: [BriefController, GovernanceController, AgentController],
  providers: [
    ...databaseProviders,
    BriefService,
    ProviderRegistry,
    RetentionService,
    GovernanceService,
    AgentService,
    AgentWorker,
  ],
})
export class AppModule {}
