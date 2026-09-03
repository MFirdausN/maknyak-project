export type ServiceStatus = "ok" | "degraded";

export interface HealthResponse {
  readonly service: string;
  readonly status: ServiceStatus;
  readonly version: string;
  readonly timestamp: string;
}

export interface ServiceInfo {
  readonly name: string;
  readonly domain: string;
  readonly version: string;
  readonly description: string;
}

export const API_VERSION = "v1" as const;
