import { Inject, Injectable, Logger } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { telegramConfigSchema } from "@maknyak/config";
import type { Pool } from "pg";
import { DATABASE } from "./database";

interface TelegramDelivery {
  id: string;
  workspace_id: string;
  job_id: string;
  kind: "approval_required" | "job_completed" | "job_failed";
  title: string;
}

interface TelegramClientConfig {
  token: string;
  chatId: string;
  timeoutMs: number;
}

export class TelegramClient {
  constructor(private readonly config: TelegramClientConfig) {}

  async send(text: string): Promise<void> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.config.token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text,
          protect_content: true,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      },
    );
    if (!response.ok)
      throw new Error(`Telegram request failed with status ${response.status}`);
  }
}

@Injectable()
export class TelegramNotifier implements OnModuleInit {
  private readonly logger = new Logger(TelegramNotifier.name);
  private readonly workerId = `${process.env.HOSTNAME ?? "agent"}-${process.pid}`;
  private client?: TelegramClient;

  constructor(@Inject(DATABASE) private readonly database: Pool) {}

  onModuleInit() {
    const parsed = telegramConfigSchema.safeParse(process.env);
    if (!parsed.success) {
      if (process.env.TELEGRAM_NOTIFICATIONS_ENABLED === "true")
        throw new Error("Telegram notification configuration is invalid");
      return;
    }
    if (!parsed.data.TELEGRAM_NOTIFICATIONS_ENABLED) return;
    this.client = new TelegramClient({
      token: parsed.data.TELEGRAM_BOT_TOKEN!,
      chatId: parsed.data.TELEGRAM_CHAT_ID!,
      timeoutMs: parsed.data.TELEGRAM_TIMEOUT_MS,
    });
    this.logger.log("Telegram notifications enabled");
  }

  async flushOne(): Promise<boolean> {
    if (!this.client) return false;
    const claimed = await this.database.query<TelegramDelivery>(
      `WITH candidate AS (
         SELECT id FROM agent.notifications
         WHERE telegram_sent_at IS NULL
           AND telegram_attempts < 5
           AND telegram_next_attempt_at <= now()
           AND expires_at > now()
           AND (telegram_locked_at IS NULL OR telegram_locked_at < now() - interval '2 minutes')
         ORDER BY created_at, id
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE agent.notifications notification
       SET telegram_locked_at = now(), telegram_locked_by = $1,
           telegram_attempts = telegram_attempts + 1
       FROM candidate WHERE notification.id = candidate.id
       RETURNING notification.id, notification.workspace_id, notification.job_id,
                 notification.kind, notification.title`,
      [this.workerId],
    );
    const notification = claimed.rows[0];
    if (!notification) return false;
    try {
      await this.client.send(formatTelegramNotification(notification));
      await this.database.query(
        `UPDATE agent.notifications
         SET telegram_sent_at = now(), telegram_locked_at = NULL,
             telegram_locked_by = NULL, telegram_error_code = NULL
         WHERE id = $1 AND telegram_locked_by = $2`,
        [notification.id, this.workerId],
      );
    } catch {
      await this.database.query(
        `UPDATE agent.notifications
         SET telegram_locked_at = NULL, telegram_locked_by = NULL,
             telegram_error_code = 'delivery_failed',
             telegram_next_attempt_at = now() + (least(300, power(2, telegram_attempts) * 5) * interval '1 second')
         WHERE id = $1 AND telegram_locked_by = $2`,
        [notification.id, this.workerId],
      );
      this.logger.warn("Telegram notification delivery failed");
    }
    return true;
  }
}

export function formatTelegramNotification(
  notification: TelegramDelivery,
): string {
  const label = {
    approval_required: "Approval diperlukan",
    job_completed: "Agent selesai",
    job_failed: "Agent gagal",
  }[notification.kind];
  return [
    `Maknyak — ${label}`,
    notification.title,
    `Workspace: ${notification.workspace_id}`,
    `Job: ${notification.job_id}`,
  ].join("\n");
}
