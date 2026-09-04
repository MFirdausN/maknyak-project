import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { decodeClaims, refreshSession, sessionToken } from "../../../lib/auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await sessionToken(request);
  if (!session) return NextResponse.json({ authenticated: false });
  const claims = decodeClaims(session.accessToken);
  const response = NextResponse.json({
    authenticated: true,
    principal: {
      username: claims.preferred_username,
      email: claims.email,
      name: claims.name,
    },
  });
  if (session.refreshed) refreshSession(response, session.tokens);
  return response;
}
