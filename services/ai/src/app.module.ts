import { Module } from "@nestjs/common";
import { BriefController } from "./brief.controller";
import { BriefService } from "./brief.service";
import { databaseProviders } from "./database";
import { ProviderRegistry } from "./provider";
import { RetentionService } from "./retention.service";
import { GovernanceController } from "./governance.controller";
import { GovernanceService } from "./governance.service";

@Module({
  controllers: [BriefController, GovernanceController],
  providers: [
    ...databaseProviders,
    BriefService,
    ProviderRegistry,
    RetentionService,
    GovernanceService,
  ],
})
export class AppModule {}
