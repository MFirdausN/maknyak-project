import type { NextRequest, NextResponse } from "next/server";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  id_token?: string;
}

export function authConfig() {
  return {
    publicIssuer:
      process.env.OIDC_ISSUER ?? "http://localhost:8080/realms/maknyak",
    tokenUrl:
      process.env.OIDC_TOKEN_URL ??
      "http://keycloak:8080/realms/maknyak/protocol/openid-connect/token",
    clientId: process.env.OIDC_CLIENT_ID ?? "maknyak-cli",
    publicUrl: process.env.DASHBOARD_PUBLIC_URL ?? "http://localhost:3003",
    gatewayUrl: process.env.GATEWAY_INTERNAL_URL ?? "http://gateway:3000",
    secureCookies: process.env.COOKIE_SECURE === "true",
  };
}

export function authCookie(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: authConfig().secureCookies,
    path: "/",
    maxAge,
  };
}

export async function tokenRequest(
  form: Record<string, string>,
): Promise<TokenResponse | null> {
  const response = await fetch(authConfig().tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;
  return (await response.json()) as TokenResponse;
}

export function setSessionCookies(
  response: NextResponse,
  tokens: TokenResponse,
): void {
  response.cookies.set(
    "maknyak_access",
    tokens.access_token,
    authCookie(tokens.expires_in),
  );
  if (tokens.refresh_token) {
    response.cookies.set(
      "maknyak_refresh",
      tokens.refresh_token,
      authCookie(tokens.refresh_expires_in ?? 1_800),
    );
  }
  if (tokens.id_token) {
    response.cookies.set(
      "maknyak_id_token",
      tokens.id_token,
      authCookie(tokens.expires_in),
    );
  }
}

export function refreshSession(
  response: NextResponse,
  tokens: TokenResponse,
): void {
  setSessionCookies(response, tokens);
}

export function clearTransientCookies(response: NextResponse): void {
  response.cookies.delete("maknyak_oauth_state");
  response.cookies.delete("maknyak_pkce");
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete("maknyak_access");
  response.cookies.delete("maknyak_refresh");
  response.cookies.delete("maknyak_id_token");
  clearTransientCookies(response);
}

export async function sessionToken(
  request: NextRequest,
): Promise<
  | { accessToken: string; refreshed: false }
  | { accessToken: string; refreshed: true; tokens: TokenResponse }
  | null
> {
  const accessToken = request.cookies.get("maknyak_access")?.value;
  if (accessToken && !expiresSoon(accessToken))
    return { accessToken, refreshed: false };
  const refreshToken = request.cookies.get("maknyak_refresh")?.value;
  if (!refreshToken) return null;
  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    client_id: authConfig().clientId,
    refresh_token: refreshToken,
  });
  return tokens
    ? { accessToken: tokens.access_token, refreshed: true, tokens }
    : null;
}

export function decodeClaims(token: string): Record<string, unknown> {
  const encoded = token.split(".")[1];
  if (!encoded) return {};
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString()) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

function expiresSoon(token: string): boolean {
  const exp = decodeClaims(token).exp;
  return typeof exp !== "number" || exp * 1_000 <= Date.now() + 30_000;
}
