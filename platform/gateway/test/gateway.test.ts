import assert from "node:assert/strict";
import test from "node:test";
import { GatewayController } from "../src/gateway.controller";

test("gateway publishes a stable health contract", () => {
  const controller = new GatewayController();
  assert.deepEqual(Object.keys(controller.health()), [
    "service",
    "status",
    "version",
    "timestamp",
  ]);
  assert.equal(controller.health().status, "ok");
});
