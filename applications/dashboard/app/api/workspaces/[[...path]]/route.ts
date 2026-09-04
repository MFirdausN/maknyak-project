import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authConfig, refreshSession, sessionToken } from "../../../../lib/auth";

interface RouteContext {
  params: Promise<{ path?: string[] }>;
}

async function forward(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const config = authConfig();
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin !== config.publicUrl) {
      return NextResponse.json(
        { message: "Invalid request origin" },
        { status: 403 },
      );
    }
  }
  const session = await sessionToken(request);
  if (!session)
    return NextResponse.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  const { path = [] } = await context.params;
  const target = new URL(
    `${config.gatewayUrl}/api/v1/workspaces/${path.join("/")}`,
  );
  target.search = request.nextUrl.search;
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.text();
  const init: RequestInit = {
    method: request.method,
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      "content-type": request.headers.get("content-type") ?? "application/json",
      "x-request-id":
        request.headers.get("x-request-id") ?? crypto.randomUUID(),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  };
  if (body !== undefined) init.body = body;
  const upstream = await fetch(target, init);
  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
  if (session.refreshed) refreshSession(response, session.tokens);
  return response;
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
