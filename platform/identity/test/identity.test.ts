import assert from "node:assert/strict";
import test from "node:test";
import { InternalKeyGuard } from "../src/internal-key";

test("internal identity endpoint rejects an invalid service key", () => {
  process.env.INTERNAL_API_KEY = "test-internal-key";
  const guard = new InternalKeyGuard();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { "x-internal-api-key": "wrong" } }),
    }),
  };
  assert.throws(() => guard.canActivate(context as never));
});
