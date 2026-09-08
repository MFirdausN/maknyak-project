import {
  BadGatewayException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export interface CheckoutRequest {
  orderId: string;
  amountIdr: number;
  itemName: string;
  finishUrl: string;
}

export interface CheckoutSession {
  provider: "midtrans";
  orderId: string;
  token: string;
  redirectUrl: string;
}

export interface PaymentAdapter {
  createCheckout(input: CheckoutRequest): Promise<CheckoutSession>;
}

export class DisabledPaymentAdapter implements PaymentAdapter {
  async createCheckout(): Promise<CheckoutSession> {
    throw new ServiceUnavailableException("Payment checkout is not configured");
  }
}

const snapResponseSchema = z.object({
  token: z.string().min(1),
  redirect_url: z.string().url(),
});

export class MidtransSnapAdapter implements PaymentAdapter {
  constructor(
    private readonly serverKey: string,
    private readonly production: boolean,
    private readonly request: typeof fetch = fetch,
  ) {}

  async createCheckout(input: CheckoutRequest): Promise<CheckoutSession> {
    const orderId = z
      .string()
      .min(1)
      .max(50)
      .regex(/^[A-Za-z0-9._~-]+$/)
      .parse(input.orderId);
    const amount = z.number().int().positive().parse(input.amountIdr);
    const itemName = z.string().trim().min(1).max(50).parse(input.itemName);
    const finishUrl = z.string().url().parse(input.finishUrl);
    const baseUrl = this.production
      ? "https://app.midtrans.com"
      : "https://app.sandbox.midtrans.com";
    const response = await this.request(`${baseUrl}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${this.serverKey}:`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: amount },
        item_details: [
          { id: "TEAM", price: amount, quantity: 1, name: itemName },
        ],
        callbacks: { finish: finishUrl },
        page_expiry: { duration: 24, unit: "hours" },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new BadGatewayException(
        `Midtrans checkout failed (${response.status})`,
      );
    const parsed = snapResponseSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new BadGatewayException(
        "Midtrans returned an invalid checkout response",
      );
    return {
      provider: "midtrans",
      orderId,
      token: parsed.data.token,
      redirectUrl: parsed.data.redirect_url,
    };
  }
}

export interface MidtransNotification {
  order_id: string;
  status_code: string;
  gross_amount: string;
  transaction_status: string;
  transaction_id?: string;
  fraud_status?: string;
  signature_key: string;
}

export type MidtransPaymentState = "paid" | "pending" | "cancelled" | "ignored";

export function verifyMidtransNotification(
  notification: MidtransNotification,
  serverKey: string,
): boolean {
  const expected = createHash("sha512")
    .update(
      `${notification.order_id}${notification.status_code}${notification.gross_amount}${serverKey}`,
    )
    .digest();
  const supplied = Buffer.from(notification.signature_key, "hex");
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export function classifyMidtransNotification(
  notification: MidtransNotification,
): MidtransPaymentState {
  if (
    ["settlement", "capture"].includes(notification.transaction_status) &&
    notification.status_code === "200" &&
    (!notification.fraud_status || notification.fraud_status === "accept")
  )
    return "paid";
  if (notification.transaction_status === "pending") return "pending";
  if (["cancel", "deny", "expire"].includes(notification.transaction_status))
    return "cancelled";
  return "ignored";
}
