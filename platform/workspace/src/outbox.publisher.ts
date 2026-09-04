import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { NatsConnection } from "@nats-io/nats-core";
import { connect } from "@nats-io/transport-node";
import type { Pool, PoolClient } from "pg";
import { DATABASE } from "./database";

interface OutboxRow {
  id: string;
  subject: string;
  payload: object;
}

@Injectable()
export class OutboxPublisher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxPublisher.name);
  private readonly natsUrl = process.env.NATS_URL ?? "nats://localhost:4222";
  private connection: NatsConnection | null = null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@Inject(DATABASE) private readonly database: Pool) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.publishAvailable(), 1_000);
    this.timer.unref();
    void this.publishAvailable();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.connection && !this.connection.isClosed()) {
      await this.connection.drain();
    }
  }

  private async publishAvailable(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let published = 0; published < 25; published += 1) {
        if (!(await this.publishNext())) break;
      }
    } catch (error) {
      this.logger.warn(`Outbox delivery paused: ${errorMessage(error)}`);
      this.connection = null;
    } finally {
      this.running = false;
    }
  }

  private async publishNext(): Promise<boolean> {
    const client = await this.database.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      const result = await client.query<OutboxRow>(
        `SELECT id, subject, payload FROM workspace.outbox
         WHERE published_at IS NULL
         ORDER BY occurred_at
         LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const event = result.rows[0];
      if (!event) {
        await client.query("COMMIT");
        transactionOpen = false;
        return false;
      }
      try {
        const connection = await this.nats();
        connection.publish(event.subject, JSON.stringify(event.payload));
        await connection.flush();
        await client.query(
          `UPDATE workspace.outbox
           SET published_at = now(), delivery_attempts = delivery_attempts + 1, last_error = NULL
           WHERE id = $1`,
          [event.id],
        );
      } catch (error) {
        await this.recordFailure(client, event.id, error);
        await client.query("COMMIT");
        transactionOpen = false;
        throw error;
      }
      await client.query("COMMIT");
      transactionOpen = false;
      return true;
    } catch (error) {
      if (transactionOpen) await safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async nats(): Promise<NatsConnection> {
    if (!this.connection || this.connection.isClosed()) {
      this.connection = await connect({
        servers: this.natsUrl,
        timeout: 2_000,
      });
    }
    const connection = this.connection;
    if (!connection) throw new Error("NATS connection was not established");
    return connection;
  }

  private async recordFailure(
    client: PoolClient,
    id: string,
    error: unknown,
  ): Promise<void> {
    await client.query(
      `UPDATE workspace.outbox
       SET delivery_attempts = delivery_attempts + 1, last_error = $2
       WHERE id = $1`,
      [id, errorMessage(error).slice(0, 500)],
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown NATS delivery error";
}

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The connection will be released and discarded by pg if it is unusable.
  }
}
