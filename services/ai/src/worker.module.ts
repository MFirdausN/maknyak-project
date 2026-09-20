import { Module } from "@nestjs/common";
import { AgentService } from "./agent.service";
import { AgentWorker } from "./agent.worker";
import { databaseProviders } from "./database";
import { ObjectStore } from "./object-store";
import { TelegramNotifier } from "./telegram-notifier";

@Module({
  providers: [
    ...databaseProviders,
    AgentService,
    AgentWorker,
    ObjectStore,
    TelegramNotifier,
  ],
})
export class WorkerModule {}
