import { Module } from "@nestjs/common";
import { IdentityController } from "./identity.controller";
import { databaseProviders } from "./database";
import { IdentityService } from "./identity.service";

@Module({
  controllers: [IdentityController],
  providers: [...databaseProviders, IdentityService],
})
export class AppModule {}
