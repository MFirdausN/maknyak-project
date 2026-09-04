import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  authConfig,
  clearTransientCookies,
  setSessionCookies,
  tokenRequest,
} from "../../../../lib/auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = authConfig();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("maknyak_oauth_state")?.value;
  const verifier = request.cookies.get("maknyak_pkce")?.value;
  if (
    !code ||
    !state ||
    !expectedState ||
    state !== expectedState ||
    !verifier
  ) {
    return NextResponse.json(
      { message: "Invalid OAuth callback state" },
      { status: 400 },
    );
  }

  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    redirect_uri: `${config.publicUrl}/api/auth/callback`,
  });
  if (!tokens) {
    return NextResponse.json(
      { message: "OIDC token exchange failed" },
      { status: 502 },
    );
  }

  const response = NextResponse.redirect(config.publicUrl);
  setSessionCookies(response, tokens);
  clearTransientCookies(response);
  return response;
}
