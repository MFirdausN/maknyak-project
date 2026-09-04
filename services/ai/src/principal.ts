import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { internalServiceConfigSchema } from "@maknyak/config";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const PrincipalId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context
      .switchToHttp()
      .getRequest<{ header(name: string): string | undefined }>();
    const supplied = request.header("x-internal-api-key");
    const expected = internalServiceConfigSchema.parse(
      process.env,
    ).INTERNAL_API_KEY;
    if (!supplied || !safeEqual(supplied, expected))
      throw new UnauthorizedException("Invalid internal service credential");
    const principal = z
      .string()
      .uuid()
      .safeParse(request.header("x-principal-id"));
    if (!principal.success)
      throw new UnauthorizedException("A valid principal context is required");
    return principal.data;
  },
);

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
