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
      const result = await this.database.query(
        `WITH deleted_briefs AS (DELETE FROM ai.briefs WHERE expires_at <= now() RETURNING 1),
          deleted_runs AS (DELETE FROM ai.runs WHERE expires_at <= now() RETURNING 1)
         SELECT (SELECT count(*) FROM deleted_briefs)::int AS briefs,
                (SELECT count(*) FROM deleted_runs)::int AS runs`,
      );
      const row = result.rows[0] as
        { briefs: number; runs: number } | undefined;
      if (row && (row.briefs > 0 || row.runs > 0))
        this.logger.log(
          `Removed expired AI records: briefs=${row.briefs} runs=${row.runs}`,
        );
    } catch (error) {
      this.logger.error(
        "AI retention cleanup failed",
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
