import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  type CanActivate,
  type ExecutionContext,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { createClient } from "redis";

@Injectable()
export class RateLimitGuard implements CanActivate, OnApplicationShutdown {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly limit = Number(process.env.GATEWAY_RATE_LIMIT ?? 120);
  private readonly client = createClient({
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  });
  private connection: Promise<void> | null = null;

  constructor() {
    this.client.on("error", (error) =>
      this.logger.warn(`Redis rate-limit connection: ${error.message}`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
    }>();
    const response = context.switchToHttp().getResponse<{
      setHeader(name: string, value: string | number): void;
    }>();
    try {
      await this.connected();
      const key = `gateway:rate:${request.ip ?? request.socket?.remoteAddress ?? "unknown"}:${Math.floor(Date.now() / 60_000)}`;
      const count = await this.client.incr(key);
      if (count === 1) await this.client.expire(key, 60);
      response.setHeader("x-ratelimit-limit", this.limit);
      response.setHeader(
        "x-ratelimit-remaining",
        Math.max(0, this.limit - count),
      );
      if (count > this.limit) {
        throw new HttpException("Rate limit exceeded", 429);
      }
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException("Rate limiter unavailable");
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }

  private async connected(): Promise<void> {
    if (this.client.isReady) return;
    this.connection ??= this.client.connect().then(() => undefined);
    try {
      await this.connection;
    } finally {
      this.connection = null;
    }
  }
}
