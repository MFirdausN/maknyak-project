import assert from "node:assert/strict";
import test from "node:test";
import { AuthenticationGuard } from "../src/auth";

test("development auth rejects a missing principal", async () => {
  process.env.AUTH_MODE = "development";
  process.env.OIDC_ISSUER = "http://localhost:8080/realms/test";
  process.env.OIDC_JWKS_URL = "http://localhost:8080/certs";
  process.env.OIDC_CLIENT_ID = "test";
  process.env.IDENTITY_URL = "http://localhost:3001";
  process.env.WORKSPACE_URL = "http://localhost:3002";
  process.env.INTERNAL_API_KEY = "test-internal-key";
  const guard = new AuthenticationGuard();
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
  };
  await assert.rejects(guard.canActivate(context as never));
});
