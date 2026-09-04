import { Module } from "@nestjs/common";
import { BriefController } from "./brief.controller";
import { BriefService } from "./brief.service";
import { databaseProviders } from "./database";
import { ProviderRegistry } from "./provider";
import { RetentionService } from "./retention.service";

@Module({
  controllers: [BriefController],
  providers: [
    ...databaseProviders,
    BriefService,
    ProviderRegistry,
    RetentionService,
  ],
})
export class AppModule {}
