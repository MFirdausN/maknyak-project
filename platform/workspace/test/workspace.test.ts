import assert from "node:assert/strict";
import test from "node:test";
import { requireRole } from "../src/policy";
import {
  billingEventSchema,
  signBillingEvent,
  verifyBillingEvent,
  type BillingEvent,
} from "../src/billing-webhook";

test("workspace role hierarchy enforces minimum access", () => {
  assert.doesNotThrow(() => requireRole("owner", "admin"));
  assert.doesNotThrow(() => requireRole("member", "member"));
  assert.throws(() => requireRole("viewer", "member"));
  assert.throws(() => requireRole(undefined, "viewer"));
});

test("billing event semantics bind activation to Team and cancellation to Free", () => {
  const common = {
    provider: "test-provider",
    eventId: "event-12345678",
    workspaceId: "11111111-1111-4111-8111-111111111111",
    occurredAt: new Date().toISOString(),
  };
  assert.equal(
    billingEventSchema.safeParse({
      ...common,
      type: "subscription.cancelled",
      planKey: "free",
    }).success,
    true,
  );
  assert.equal(
    billingEventSchema.safeParse({
      ...common,
      type: "subscription.cancelled",
      planKey: "team",
    }).success,
    false,
  );
});

test("billing events require a valid signature and recent timestamp", () => {
  const now = Date.now();
  const event: BillingEvent = {
    provider: "test-provider",
    eventId: "event-12345678",
    type: "subscription.activated",
    workspaceId: "11111111-1111-4111-8111-111111111111",
    planKey: "team",
    occurredAt: new Date(now).toISOString(),
  };
  const secret = "test-billing-secret-at-least-32-characters";
  assert.doesNotThrow(() =>
    verifyBillingEvent(
      event,
      `sha256=${signBillingEvent(event, secret)}`,
      secret,
      now,
    ),
  );
  assert.throws(() => verifyBillingEvent(event, "sha256=00", secret, now));
  assert.throws(() =>
    verifyBillingEvent(
      { ...event, occurredAt: new Date(now - 6 * 60_000).toISOString() },
      `sha256=${signBillingEvent(event, secret)}`,
      secret,
      now,
    ),
  );
});
