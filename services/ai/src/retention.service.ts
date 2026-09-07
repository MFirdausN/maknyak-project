import { Inject, Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Pool } from "pg";
import { DATABASE } from "./database";

@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(@Inject(DATABASE) private readonly database: Pool) {}

  onModuleInit(): void {
    void this.cleanup();
    this.timer = setInterval(() => void this.cleanup(), 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup(): Promise<void> {
    try {
      const conversations = await this.database.query(
        `DELETE FROM ai.conversations WHERE expires_at <= now()`,
      );
      const results = {
        conversations: conversations.rowCount ?? 0,
        briefs:
          (
            await this.database.query(
              `DELETE FROM ai.briefs WHERE expires_at <= now()`,
            )
          ).rowCount ?? 0,
        runs:
          (
            await this.database.query(
              `DELETE FROM ai.runs WHERE expires_at <= now()`,
            )
          ).rowCount ?? 0,
        memories:
          (
            await this.database.query(
              `DELETE FROM ai.memories WHERE expires_at <= now()`,
            )
          ).rowCount ?? 0,
        tools:
          (
            await this.database.query(
              `DELETE FROM ai.tool_requests WHERE expires_at <= now()`,
            )
          ).rowCount ?? 0,
      };
      if (Object.values(results).some((value) => value > 0))
        this.logger.log(
          `Removed expired AI records: ${JSON.stringify(results)}`,
        );
    } catch (error) {
      this.logger.error(
        "AI retention cleanup failed",
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
