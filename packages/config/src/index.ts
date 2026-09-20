import { z } from "zod";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const baseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export function serviceConfig(
  service: "gateway" | "identity" | "workspace" | "ai",
) {
  const defaults = {
    gateway: 3000,
    identity: 3001,
    workspace: 3002,
    ai: 3004,
  } as const;
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

export const gatewayConfigSchema = baseSchema
  .extend({
    GATEWAY_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    IDENTITY_URL: z.string().url().default("http://localhost:3001"),
    WORKSPACE_URL: z.string().url().default("http://localhost:3002"),
    AI_URL: z.string().url().default("http://localhost:3004"),
    AUTH_MODE: z.enum(["oidc", "development"]).default("oidc"),
    OIDC_ISSUER: z.string().url(),
    OIDC_JWKS_URL: z.string().url(),
    OIDC_CLIENT_ID: z.string().min(1),
    INTERNAL_API_KEY: z.string().min(16),
  })
  .superRefine((config, context) => {
    if (
      config.NODE_ENV === "production" &&
      config.INTERNAL_API_KEY === "change-this-in-every-environment"
    ) {
      context.addIssue({
        code: "custom",
        path: ["INTERNAL_API_KEY"],
        message: "Placeholder service credentials are forbidden in production",
      });
    }
    if (
      config.NODE_ENV === "production" &&
      config.AUTH_MODE === "development"
    ) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_MODE"],
        message: "Development authentication is forbidden in production",
      });
    }
  });

export const databaseConfigSchema = baseSchema.extend({
  DATABASE_URL: z.string().min(1),
});

export const internalServiceConfigSchema = baseSchema
  .extend({ INTERNAL_API_KEY: z.string().min(16) })
  .superRefine((config, context) => {
    if (
      config.NODE_ENV === "production" &&
      config.INTERNAL_API_KEY === "change-this-in-every-environment"
    ) {
      context.addIssue({
        code: "custom",
        path: ["INTERNAL_API_KEY"],
        message: "Placeholder service credentials are forbidden in production",
      });
    }
  });

export const billingWebhookConfigSchema = baseSchema
  .extend({ BILLING_WEBHOOK_SECRET: z.string().min(32) })
  .superRefine((config, context) => {
    if (
      config.NODE_ENV === "production" &&
      config.BILLING_WEBHOOK_SECRET ===
        "change-this-billing-secret-in-every-environment"
    ) {
      context.addIssue({
        code: "custom",
        path: ["BILLING_WEBHOOK_SECRET"],
        message: "Placeholder billing credentials are forbidden in production",
      });
    }
  });

export const paymentProviderConfigSchema = baseSchema
  .extend({
    PAYMENT_PROVIDER: z.enum(["disabled", "midtrans"]).default("disabled"),
    MIDTRANS_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    MIDTRANS_SERVER_KEY: z.string().min(1).optional(),
    PAYMENT_FINISH_URL: z.string().url().optional(),
  })
  .superRefine((config, context) => {
    if (config.PAYMENT_PROVIDER !== "midtrans") return;
    if (!config.MIDTRANS_SERVER_KEY)
      context.addIssue({
        code: "custom",
        path: ["MIDTRANS_SERVER_KEY"],
        message: "Required when Midtrans is enabled",
      });
    if (!config.PAYMENT_FINISH_URL)
      context.addIssue({
        code: "custom",
        path: ["PAYMENT_FINISH_URL"],
        message: "Required when Midtrans is enabled",
      });
    if (
      config.NODE_ENV === "production" &&
      config.MIDTRANS_ENVIRONMENT !== "production"
    )
      context.addIssue({
        code: "custom",
        path: ["MIDTRANS_ENVIRONMENT"],
        message: "Production must not use Midtrans sandbox",
      });
  });

export const openAIConfigSchema = z.object({
  OPENAI_API_KEY: z.string().min(20),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(180_000)
    .default(90_000),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(256)
    .max(16_000)
    .default(2_400),
  OPENAI_INPUT_PRICE_MICROUSD_PER_MILLION: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(200_000),
  OPENAI_OUTPUT_PRICE_MICROUSD_PER_MILLION: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(1_200_000),
});

export const telegramConfigSchema = z
  .object({
    TELEGRAM_NOTIFICATIONS_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    TELEGRAM_BOT_TOKEN: z.string().min(20).optional(),
    TELEGRAM_CHAT_ID: z
      .string()
      .regex(/^-?\d+$/)
      .optional(),
    TELEGRAM_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(30_000)
      .default(10_000),
  })
  .superRefine((config, context) => {
    if (!config.TELEGRAM_NOTIFICATIONS_ENABLED) return;
    if (!config.TELEGRAM_BOT_TOKEN)
      context.addIssue({
        code: "custom",
        path: ["TELEGRAM_BOT_TOKEN"],
        message: "Required when Telegram notifications are enabled",
      });
    if (!config.TELEGRAM_CHAT_ID)
      context.addIssue({
        code: "custom",
        path: ["TELEGRAM_CHAT_ID"],
        message: "Required when Telegram notifications are enabled",
      });
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
  end?(body?: string): void;
}

type Next = () => void;

const durationBucketsMs = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

interface MetricValue {
  count: number;
  sumMs: number;
  buckets: number[];
}

const metrics = new Map<string, Map<string, MetricValue>>();

function normalizeRoute(value: string): string {
  const path = value.split(/[?#]/, 1)[0] || "/";
  return path
    .split("/")
    .map((segment) => {
      if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment)) return ":id";
      if (/^\d+$/.test(segment)) return ":number";
      return segment.length > 80 ? ":value" : segment;
    })
    .join("/");
}

function metricKey(method: string, route: string, statusClass: string): string {
  return JSON.stringify([method, route, statusClass]);
}

function recordRequest(
  service: string,
  method: string,
  route: string,
  statusCode: number,
  durationMs: number,
): void {
  const serviceMetrics = metrics.get(service) ?? new Map<string, MetricValue>();
  metrics.set(service, serviceMetrics);
  const key = metricKey(method, route, `${Math.floor(statusCode / 100)}xx`);
  const value = serviceMetrics.get(key) ?? {
    count: 0,
    sumMs: 0,
    buckets: durationBucketsMs.map(() => 0),
  };
  value.count += 1;
  value.sumMs += durationMs;
  durationBucketsMs.forEach((bucket, index) => {
    if (durationMs <= bucket) value.buckets[index]! += 1;
  });
  serviceMetrics.set(key, value);
}

function label(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n");
}

export function renderMetrics(service: string): string {
  const lines = [
    "# HELP maknyak_http_requests_total Completed HTTP requests.",
    "# TYPE maknyak_http_requests_total counter",
  ];
  const serviceMetrics = metrics.get(service) ?? new Map<string, MetricValue>();
  for (const [key, value] of serviceMetrics) {
    const [method, route, statusClass] = JSON.parse(key) as string[];
    const labels = `service="${label(service)}",method="${label(method!)}",route="${label(route!)}",status_class="${label(statusClass!)}"`;
    lines.push(`maknyak_http_requests_total{${labels}} ${value.count}`);
  }
  lines.push(
    "# HELP maknyak_http_request_duration_ms HTTP request duration in milliseconds.",
    "# TYPE maknyak_http_request_duration_ms histogram",
  );
  for (const [key, value] of serviceMetrics) {
    const [method, route, statusClass] = JSON.parse(key) as string[];
    const labels = `service="${label(service)}",method="${label(method!)}",route="${label(route!)}",status_class="${label(statusClass!)}"`;
    durationBucketsMs.forEach((bucket, index) =>
      lines.push(
        `maknyak_http_request_duration_ms_bucket{${labels},le="${bucket}"} ${value.buckets[index]}`,
      ),
    );
    lines.push(
      `maknyak_http_request_duration_ms_bucket{${labels},le="+Inf"} ${value.count}`,
      `maknyak_http_request_duration_ms_sum{${labels}} ${value.sumMs.toFixed(3)}`,
      `maknyak_http_request_duration_ms_count{${labels}} ${value.count}`,
    );
  }
  const memory = process.memoryUsage();
  lines.push(
    "# HELP maknyak_process_resident_memory_bytes Resident memory size in bytes.",
    "# TYPE maknyak_process_resident_memory_bytes gauge",
    `maknyak_process_resident_memory_bytes{service="${label(service)}"} ${memory.rss}`,
    "# HELP maknyak_process_heap_used_bytes JavaScript heap used in bytes.",
    "# TYPE maknyak_process_heap_used_bytes gauge",
    `maknyak_process_heap_used_bytes{service="${label(service)}"} ${memory.heapUsed}`,
    "# HELP maknyak_process_uptime_seconds Process uptime in seconds.",
    "# TYPE maknyak_process_uptime_seconds gauge",
    `maknyak_process_uptime_seconds{service="${label(service)}"} ${process.uptime().toFixed(3)}`,
    "",
  );
  return lines.join("\n");
}

export function metricsEndpoint(service: string) {
  return (
    request: TelemetryRequest,
    response: TelemetryResponse,
    next: Next,
  ): void => {
    if (
      normalizeRoute(request.originalUrl ?? request.url ?? "/") !==
      "/api/v1/metrics"
    ) {
      next();
      return;
    }
    const configuredToken = process.env.METRICS_TOKEN;
    const authorization = request.headers?.authorization;
    const suppliedToken =
      typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";
    const configured = Buffer.from(configuredToken ?? "");
    const supplied = Buffer.from(suppliedToken);
    if (
      configured.length < 16 ||
      configured.length !== supplied.length ||
      !timingSafeEqual(configured, supplied)
    ) {
      response.statusCode = 401;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end?.("Unauthorized\n");
      return;
    }
    response.statusCode = 200;
    response.setHeader(
      "content-type",
      "text/plain; version=0.0.4; charset=utf-8",
    );
    response.setHeader("cache-control", "no-store");
    response.end?.(renderMetrics(service));
  };
}

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
    const receivedTrace = request.headers?.traceparent;
    const traceId =
      typeof receivedTrace === "string" &&
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i.test(receivedTrace)
        ? receivedTrace.split("-")[1]!
        : randomBytes(16).toString("hex");
    const traceparent = `00-${traceId}-${randomBytes(8).toString("hex")}-01`;

    request.headers ??= {};
    request.headers["x-request-id"] = requestId;
    request.headers.traceparent = traceparent;
    response.setHeader("x-request-id", requestId);
    response.setHeader("traceparent", traceparent);
    response.once("finish", () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const rawPath = request.originalUrl ?? request.url ?? "/";
      const path = rawPath.split(/[?#]/, 1)[0] || "/";
      recordRequest(
        service,
        request.method ?? "UNKNOWN",
        normalizeRoute(rawPath),
        response.statusCode,
        durationMs,
      );
      process.stdout.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          event: "http.request.completed",
          service,
          requestId,
          traceId,
          method: request.method ?? "UNKNOWN",
          path,
          statusCode: response.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        })}\n`,
      );
    });
    next();
  };
}
