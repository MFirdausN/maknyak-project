import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import type { HealthResponse, ServiceInfo } from "@maknyak/contracts";
import { z } from "zod";
import { IdentityService, type Principal } from "./identity.service";
import { InternalKeyGuard } from "./internal-key";

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
  ) {}

  @Get()
  info(): ServiceInfo {
    return identityInfo;
  }

  @Get("/health")
  health(): HealthResponse {
    return {
      service: identityInfo.name,
      status: "ok",
      version: identityInfo.version,
      timestamp: new Date().toISOString(),
    };
  }

  @Post("/internal/principals/sync")
  @UseGuards(InternalKeyGuard)
  sync(@Body() body: unknown): Promise<Principal> {
    return this.identities.sync(principalSchema.parse(body));
  }
}
