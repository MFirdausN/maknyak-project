import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { internalServiceConfigSchema } from "@maknyak/config";
import { timingSafeEqual } from "node:crypto";

@Injectable()
export class InternalKeyGuard implements CanActivate {
  private readonly expected = internalServiceConfigSchema.parse(process.env)
    .INTERNAL_API_KEY;

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const supplied = request.headers["x-internal-api-key"];
    if (typeof supplied !== "string" || !safeEqual(supplied, this.expected)) {
      throw new UnauthorizedException("Invalid internal service credential");
    }
    return true;
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
