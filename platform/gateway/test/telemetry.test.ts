import assert from "node:assert/strict";
import test from "node:test";
import { requestTelemetry } from "@maknyak/config";

test("request telemetry preserves a safe correlation id without logging headers", () => {
  let finish: (() => void) | undefined;
  let responseRequestId = "";
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string) => {
    output += chunk;
    return true;
  }) as typeof process.stdout.write;

  try {
    const request = {
      method: "GET",
      originalUrl: "/api/v1/workspaces",
      headers: {
        "x-request-id": "request-123",
        authorization: "Bearer must-not-be-logged",
      },
    };
    requestTelemetry("gateway")(
      request,
      {
        statusCode: 401,
        setHeader: (_name, value) => {
          responseRequestId = value;
        },
        once: (_event, listener) => {
          finish = listener;
        },
      },
      () => undefined,
    );
    finish?.();

    const log = JSON.parse(output) as Record<string, unknown>;
    assert.equal(responseRequestId, "request-123");
    assert.equal(log.requestId, "request-123");
    assert.equal(log.statusCode, 401);
    assert.equal(output.includes("must-not-be-logged"), false);
  } finally {
    process.stdout.write = originalWrite;
  }
});
