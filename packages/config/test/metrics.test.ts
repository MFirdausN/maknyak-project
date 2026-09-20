import assert from "node:assert/strict";
import test from "node:test";
import { metricsEndpoint, renderMetrics, requestTelemetry } from "../src/index";

test("metrics normalize identifiers and expose bounded labels", () => {
  let finish: (() => void) | undefined;
  const originalWrite = process.stdout.write;
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    requestTelemetry("metrics-test")(
      {
        method: "GET",
        originalUrl:
          "/api/v1/workspaces/31801932-d3d3-4007-8352-0d6511a7ec8e?secret=no",
        headers: {},
      },
      {
        statusCode: 200,
        setHeader: () => undefined,
        once: (_event, listener) => {
          finish = listener;
        },
      },
      () => undefined,
    );
    finish?.();
  } finally {
    process.stdout.write = originalWrite;
  }

  const output = renderMetrics("metrics-test");
  assert.match(output, /maknyak_http_requests_total/);
  assert.match(output, /route="\/api\/v1\/workspaces\/:id"/);
  assert.match(output, /maknyak_http_request_duration_ms_bucket/);
  assert.equal(output.includes("31801932"), false);
  assert.equal(output.includes("secret"), false);
});

test("metrics endpoint requires a bearer credential", () => {
  const previous = process.env.METRICS_TOKEN;
  process.env.METRICS_TOKEN = "test-metrics-token-value";
  try {
    let body = "";
    const response = {
      statusCode: 0,
      setHeader: () => undefined,
      once: () => undefined,
      end: (value?: string) => {
        body = value ?? "";
      },
    };
    metricsEndpoint("auth-test")(
      { originalUrl: "/api/v1/metrics", headers: {} },
      response,
      () => assert.fail("metrics request must not reach application routes"),
    );
    assert.equal(response.statusCode, 401);
    assert.equal(body, "Unauthorized\n");

    metricsEndpoint("auth-test")(
      {
        originalUrl: "/api/v1/metrics",
        headers: { authorization: "Bearer test-metrics-token-value" },
      },
      response,
      () => assert.fail("metrics request must not reach application routes"),
    );
    assert.equal(response.statusCode, 200);
    assert.match(body, /maknyak_process_uptime_seconds/);
  } finally {
    if (previous === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = previous;
  }
});
