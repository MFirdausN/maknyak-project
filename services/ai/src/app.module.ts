import { Module } from "@nestjs/common";
import { BriefController } from "./brief.controller";
import { BriefService } from "./brief.service";
import { databaseProviders } from "./database";
import { ProviderRegistry } from "./provider";

@Module({
  controllers: [BriefController],
  providers: [...databaseProviders, BriefService, ProviderRegistry],
})
export class AppModule {}
