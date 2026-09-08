import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  classifyMidtransNotification,
  DisabledPaymentAdapter,
  MidtransSnapAdapter,
  verifyMidtransNotification,
  type MidtransNotification,
} from "../src/payment-adapter";

test("payment remains disabled until a provider is explicitly configured", async () => {
  await assert.rejects(new DisabledPaymentAdapter().createCheckout(), {
    message: "Payment checkout is not configured",
  });
});

test("Midtrans adapter creates a sandbox Snap request without leaking credentials", async () => {
  let request: { url: string; init: RequestInit | undefined } | undefined;
  const adapter = new MidtransSnapAdapter(
    "SB-Mid-server-test",
    false,
    async (input, init) => {
      request = { url: String(input), init };
      return new Response(
        JSON.stringify({
          token: "snap-token",
          redirect_url:
            "https://app.sandbox.midtrans.com/snap/v4/redirection/test",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    },
  );
  const session = await adapter.createCheckout({
    orderId: "MKY-test-123",
    amountIdr: 100_000,
    itemName: "Maknyak Team",
    finishUrl: "https://example.test/billing/finish",
  });
  assert.equal(
    request?.url,
    "https://app.sandbox.midtrans.com/snap/v1/transactions",
  );
  assert.equal(
    request?.init?.headers &&
      (request.init.headers as Record<string, string>).authorization,
    `Basic ${Buffer.from("SB-Mid-server-test:").toString("base64")}`,
  );
  assert.equal(session.redirectUrl.includes("sandbox.midtrans.com"), true);
});

test("Midtrans notification signature and state mapping follow provider contract", () => {
  const serverKey = "SB-Mid-server-test";
  const notification: MidtransNotification = {
    order_id: "MKY-test-123",
    status_code: "200",
    gross_amount: "100000.00",
    transaction_status: "settlement",
    fraud_status: "accept",
    signature_key: createHash("sha512")
      .update(`MKY-test-123200100000.00${serverKey}`)
      .digest("hex"),
  };
  assert.equal(verifyMidtransNotification(notification, serverKey), true);
  assert.equal(classifyMidtransNotification(notification), "paid");
  assert.equal(
    classifyMidtransNotification({
      ...notification,
      transaction_status: "expire",
    }),
    "cancelled",
  );
});
