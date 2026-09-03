import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import type { HealthResponse, ServiceInfo } from "@maknyak/contracts";
import type { Pool } from "pg";
import { z } from "zod";
import { IdentityService, type Principal } from "./identity.service";
import { InternalKeyGuard } from "./internal-key";
import { DATABASE } from "./database";

const principalSchema = z.object({
  id: z.string().uuid(),
  issuer: z.string().url(),
  subject: z.string().min(1),
  username: z.string().min(1).optional(),
  email: z.string().email().optional(),
  displayName: z.string().min(1).optional(),
});

export const identityInfo: ServiceInfo = {
  name: "identity",
  domain: "Identity",
  version: "0.1.0",
  description: "Principal and authentication boundary for Maknyak Platform.",
};

@Controller()
export class IdentityController {
  constructor(
    @Inject(IdentityService) private readonly identities: IdentityService,
    @Inject(DATABASE) private readonly database: Pool,
  ) {}

  @Get()
  info(): ServiceInfo {
    return identityInfo;
  }

  @Get("/health")
  health(): HealthResponse {
    return this.liveness();
  }

  @Get("/health/live")
  liveness(): HealthResponse {
    return {
      service: identityInfo.name,
      status: "ok",
      version: identityInfo.version,
      timestamp: new Date().toISOString(),
    };
  }

  @Get("/health/ready")
  async readiness(): Promise<HealthResponse> {
    try {
      await this.database.query("SELECT 1");
      return this.liveness();
    } catch {
      throw new ServiceUnavailableException({
        ...this.liveness(),
        status: "degraded",
      });
    }
  }

  @Post("/internal/principals/sync")
  @UseGuards(InternalKeyGuard)
  sync(@Body() body: unknown): Promise<Principal> {
    return this.identities.sync(principalSchema.parse(body));
  }
}
