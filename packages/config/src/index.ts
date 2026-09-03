import { z } from "zod";
import { randomUUID } from "node:crypto";

const baseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export function serviceConfig(service: "gateway" | "identity" | "workspace") {
  const defaults = { gateway: 3000, identity: 3001, workspace: 3002 } as const;
  return baseSchema
    .extend({
      PORT: z.coerce
        .number()
        .int()
        .min(1)
        .max(65_535)
        .default(defaults[service]),
    })
    .parse({
      ...process.env,
      PORT: process.env[`${service.toUpperCase()}_PORT`] ?? process.env.PORT,
    });
}

export const gatewayConfigSchema = baseSchema.extend({
  GATEWAY_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  IDENTITY_URL: z.string().url().default("http://localhost:3001"),
  WORKSPACE_URL: z.string().url().default("http://localhost:3002"),
  AUTH_MODE: z.enum(["oidc", "development"]).default("oidc"),
  OIDC_ISSUER: z.string().url(),
  OIDC_JWKS_URL: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  INTERNAL_API_KEY: z.string().min(16),
});

export const databaseConfigSchema = baseSchema.extend({
  DATABASE_URL: z.string().min(1),
});

export const internalServiceConfigSchema = z.object({
  INTERNAL_API_KEY: z.string().min(16),
});

interface TelemetryRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface TelemetryResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  once(event: "finish", listener: () => void): void;
}

type Next = () => void;

export function requestTelemetry(service: string) {
  return (
    request: TelemetryRequest,
    response: TelemetryResponse,
    next: Next,
  ): void => {
    const received = request.headers?.["x-request-id"];
    const requestId =
      typeof received === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(received)
        ? received
        : randomUUID();
    const startedAt = process.hrtime.bigint();

    request.headers ??= {};
    request.headers["x-request-id"] = requestId;
    response.setHeader("x-request-id", requestId);
    response.once("finish", () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      process.stdout.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          event: "http.request.completed",
          service,
          requestId,
          method: request.method ?? "UNKNOWN",
          path: request.originalUrl ?? request.url ?? "/",
          statusCode: response.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        })}\n`,
      );
    });
    next();
  };
}
