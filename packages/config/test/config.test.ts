import assert from "node:assert/strict";
import test from "node:test";
import { gatewayConfigSchema } from "../src/index";

const productionConfig = {
  NODE_ENV: "production",
  AUTH_MODE: "oidc",
  OIDC_ISSUER: "https://identity.example/realms/maknyak",
  OIDC_JWKS_URL: "https://identity.example/realms/maknyak/certs",
  OIDC_CLIENT_ID: "maknyak",
  INTERNAL_API_KEY: "a-production-grade-service-key",
} as const;

test("production accepts explicit OIDC configuration", () => {
  assert.equal(gatewayConfigSchema.parse(productionConfig).AUTH_MODE, "oidc");
});

test("production rejects development authentication", () => {
  assert.throws(() =>
    gatewayConfigSchema.parse({
      ...productionConfig,
      AUTH_MODE: "development",
    }),
  );
});
