import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authConfig, clearSessionCookies } from "../../../../lib/auth";

export function GET(request: NextRequest): NextResponse {
  const config = authConfig();
  const logout = new URL(
    `${config.publicIssuer}/protocol/openid-connect/logout`,
  );
  logout.searchParams.set("client_id", config.clientId);
  logout.searchParams.set("post_logout_redirect_uri", config.publicUrl);
  const hint = request.cookies.get("maknyak_id_token")?.value;
  if (hint) logout.searchParams.set("id_token_hint", hint);
  const response = NextResponse.redirect(logout);
  clearSessionCookies(response);
  return response;
}
