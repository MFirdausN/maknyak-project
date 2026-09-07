import { Inject, Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AgentService } from "./agent.service";

@Injectable()
export class AgentWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentWorker.name);
  private readonly workerId = `${process.env.HOSTNAME ?? "ai"}-${process.pid}`;
  private timer?: NodeJS.Timeout;
  private busy = false;
  constructor(@Inject(AgentService) private readonly agents: AgentService) {}
  onModuleInit() {
    void this.agents.heartbeat(this.workerId);
    void this.agents.recoverStale().then((count) => {
      if (count) this.logger.warn(`Recovered ${count} stale agent jobs`);
    });
    this.timer = setInterval(() => void this.tick(), 1000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    void this.agents.unregisterWorker(this.workerId);
  }
  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const processed = await this.agents.processNext(this.workerId);
      await this.agents.heartbeat(this.workerId, processed);
    } catch (error) {
      this.logger.error(
        "Agent worker tick failed",
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.busy = false;
    }
  }
}
