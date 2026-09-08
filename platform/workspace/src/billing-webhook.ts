import { UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const billingEventSchema = z
  .object({
    provider: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(/^[a-z0-9-]+$/),
    eventId: z.string().trim().min(8).max(200),
    type: z.enum(["subscription.activated", "subscription.cancelled"]),
    workspaceId: z.string().uuid(),
    planKey: z.enum(["free", "team"]),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .superRefine((event, context) => {
    if (event.type === "subscription.activated" && event.planKey !== "team")
      context.addIssue({
        code: "custom",
        path: ["planKey"],
        message: "Activation must target Team",
      });
    if (event.type === "subscription.cancelled" && event.planKey !== "free")
      context.addIssue({
        code: "custom",
        path: ["planKey"],
        message: "Cancellation must target Free",
      });
  });

export type BillingEvent = z.infer<typeof billingEventSchema>;

export function canonicalBillingEvent(event: BillingEvent): string {
  return [
    event.provider,
    event.eventId,
    event.type,
    event.workspaceId,
    event.planKey,
    event.occurredAt,
  ].join("\n");
}

export function signBillingEvent(event: BillingEvent, secret: string): string {
  return createHmac("sha256", secret)
    .update(canonicalBillingEvent(event))
    .digest("hex");
}

export function verifyBillingEvent(
  event: BillingEvent,
  signature: string | undefined,
  secret: string,
  now = Date.now(),
): void {
  const occurredAt = Date.parse(event.occurredAt);
  if (Math.abs(now - occurredAt) > 5 * 60_000)
    throw new UnauthorizedException(
      "Billing event timestamp is outside the allowed window",
    );
  if (!signature?.startsWith("sha256="))
    throw new UnauthorizedException("Invalid billing event signature");
  const supplied = Buffer.from(signature.slice(7), "hex");
  const expected = Buffer.from(signBillingEvent(event, secret), "hex");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    throw new UnauthorizedException("Invalid billing event signature");
}
