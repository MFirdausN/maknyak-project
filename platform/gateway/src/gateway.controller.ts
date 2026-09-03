import { Controller, Get } from "@nestjs/common";
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
    return {
      service: info.name,
      status: "ok",
      version: info.version,
      timestamp: new Date().toISOString(),
    };
  }
}
