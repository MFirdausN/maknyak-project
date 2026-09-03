import assert from "node:assert/strict";
import test from "node:test";
import { requireRole } from "../src/policy";

test("workspace role hierarchy enforces minimum access", () => {
  assert.doesNotThrow(() => requireRole("owner", "admin"));
  assert.doesNotThrow(() => requireRole("member", "member"));
  assert.throws(() => requireRole("viewer", "member"));
  assert.throws(() => requireRole(undefined, "viewer"));
});
