import {
  createParamDecorator,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { gatewayConfigSchema } from "@maknyak/config";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface AuthenticatedPrincipal {
  id: string;
  issuer: string;
  subject: string;
  username?: string;
  email?: string;
  displayName?: string;
}

interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: AuthenticatedPrincipal;
}

@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly config = gatewayConfigSchema.parse(process.env);
  private readonly jwks = createRemoteJWKSet(
    new URL(this.config.OIDC_JWKS_URL),
  );

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal =
      this.config.AUTH_MODE === "development"
        ? this.developmentPrincipal(request)
        : await this.oidcPrincipal(request);
    const requestId = request.headers["x-request-id"];
    await this.syncPrincipal(
      principal,
      typeof requestId === "string" ? requestId : "unknown",
    );
    request.principal = principal;
    return true;
  }

  private developmentPrincipal(
    request: AuthenticatedRequest,
  ): AuthenticatedPrincipal {
    const id = request.headers["x-dev-principal-id"];
    if (typeof id !== "string" || !isUuid(id))
      throw new UnauthorizedException("Valid x-dev-principal-id required");
    return {
      id,
      issuer: "urn:maknyak:development",
      subject: id,
      username: "local-developer",
    };
  }

  private async oidcPrincipal(
    request: AuthenticatedRequest,
  ): Promise<AuthenticatedPrincipal> {
    const authorization = request.headers.authorization;
    if (
      typeof authorization !== "string" ||
      !authorization.startsWith("Bearer ")
    ) {
      throw new UnauthorizedException("Bearer token required");
    }
    try {
      const { payload } = await jwtVerify(authorization.slice(7), this.jwks, {
        issuer: this.config.OIDC_ISSUER,
      });
      this.assertClient(payload);
      if (!payload.sub || !isUuid(payload.sub))
        throw new UnauthorizedException("Token subject must be a UUID");
      return {
        id: payload.sub,
        issuer: payload.iss ?? this.config.OIDC_ISSUER,
        subject: payload.sub,
        ...(typeof payload.preferred_username === "string"
          ? { username: payload.preferred_username }
          : {}),
        ...(typeof payload.email === "string" ? { email: payload.email } : {}),
        ...(typeof payload.name === "string"
          ? { displayName: payload.name }
          : {}),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }

  private assertClient(payload: JWTPayload): void {
    const audience = Array.isArray(payload.aud)
      ? payload.aud
      : payload.aud
        ? [payload.aud]
        : [];
    if (
      payload.azp !== this.config.OIDC_CLIENT_ID &&
      !audience.includes(this.config.OIDC_CLIENT_ID)
    ) {
      throw new UnauthorizedException("Token was not issued for this client");
    }
  }

  private async syncPrincipal(
    principal: AuthenticatedPrincipal,
    requestId: string,
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.IDENTITY_URL}/api/v1/internal/principals/sync`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-api-key": this.config.INTERNAL_API_KEY,
            "x-request-id": requestId,
          },
          body: JSON.stringify(principal),
          signal: AbortSignal.timeout(3_000),
        },
      );
      if (!response.ok) throw new Error(`Identity returned ${response.status}`);
    } catch {
      throw new ServiceUnavailableException("Identity service unavailable");
    }
  }
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) throw new UnauthorizedException();
    return request.principal;
  },
);

export const CurrentRequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const requestId = request.headers["x-request-id"];
    return typeof requestId === "string" ? requestId : "unknown";
  },
);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
