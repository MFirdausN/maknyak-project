import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { internalServiceConfigSchema } from "@maknyak/config";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

const uuid = z.string().uuid();

export const PrincipalId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context
      .switchToHttp()
      .getRequest<{ header(name: string): string | undefined }>();
    const suppliedKey = request.header("x-internal-api-key");
    const expectedKey = internalServiceConfigSchema.parse(
      process.env,
    ).INTERNAL_API_KEY;
    if (!suppliedKey || !safeEqual(suppliedKey, expectedKey))
      throw new UnauthorizedException("Invalid internal service credential");
    const raw = request.header("x-principal-id");
    const parsed = uuid.safeParse(raw);
    if (!parsed.success)
      throw new UnauthorizedException("A valid principal context is required");
    return parsed.data;
  },
);

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
