import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authConfig, authCookie } from "../../../../lib/auth";

export function GET(): NextResponse {
  const config = authConfig();
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorization = new URL(
    `${config.publicIssuer}/protocol/openid-connect/auth`,
  );
  authorization.searchParams.set("client_id", config.clientId);
  authorization.searchParams.set(
    "redirect_uri",
    `${config.publicUrl}/api/auth/callback`,
  );
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", "openid profile email");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("code_challenge", challenge);
  authorization.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorization);
  response.cookies.set("maknyak_oauth_state", state, authCookie(600));
  response.cookies.set("maknyak_pkce", verifier, authCookie(600));
  return response;
}
