import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import type { HealthResponse, ServiceInfo } from "@maknyak/contracts";

const info: ServiceInfo = {
  name: "gateway",
  domain: "Gateway",
  version: "0.1.0",
  description: "Public API edge for Maknyak Platform.",
};

@Controller()
export class GatewayController {
  @Get()
  serviceInfo(): ServiceInfo {
    return info;
  }

  @Get("/health")
  health(): HealthResponse {
    return this.liveness();
  }

  @Get("/health/live")
  liveness(): HealthResponse {
    return {
      service: info.name,
      status: "ok",
      version: info.version,
      timestamp: new Date().toISOString(),
    };
  }

  @Get("/health/ready")
  async readiness(): Promise<HealthResponse> {
    const upstreams = [
      process.env.IDENTITY_URL ?? "http://localhost:3001",
      process.env.WORKSPACE_URL ?? "http://localhost:3002",
    ];
    try {
      const responses = await Promise.all(
        upstreams.map((url) =>
          fetch(`${url}/api/v1/health/ready`, {
            signal: AbortSignal.timeout(2_000),
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) throw new Error();
      return this.liveness();
    } catch {
      throw new ServiceUnavailableException({
        ...this.liveness(),
        status: "degraded",
      });
    }
  }
}
