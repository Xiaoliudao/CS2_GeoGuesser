import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

interface AccessBindings {
  ACCESS_TEAM_DOMAIN?: unknown;
  ACCESS_AUD?: unknown;
}

export interface AccessIdentity {
  email: string;
}

export interface AccessJwtConfig {
  teamDomain: string;
  audience: string;
}

export type AccessJwtVerifier = (token: string, config: AccessJwtConfig) => Promise<JWTPayload>;

export type AccessAuthenticationResult =
  | { ok: true; identity: AccessIdentity }
  | { ok: false; response: Response };

function accessBindings(env: unknown): AccessBindings {
  return env as AccessBindings;
}

export function normalizeAccessTeamDomain(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.port
      || url.pathname !== "/"
      || url.search
      || url.hash
      || !url.hostname.endsWith(".cloudflareaccess.com")
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function readAccessJwtConfig(env: unknown): AccessJwtConfig | null {
  const bindings = accessBindings(env);
  const teamDomain = normalizeAccessTeamDomain(bindings.ACCESS_TEAM_DOMAIN);
  const audience = typeof bindings.ACCESS_AUD === "string" ? bindings.ACCESS_AUD.trim() : "";
  if (!teamDomain || !audience) return null;
  return { teamDomain, audience };
}

async function verifyCloudflareAccessJwt(token: string, config: AccessJwtConfig): Promise<JWTPayload> {
  const jwks = createRemoteJWKSet(new URL(`${config.teamDomain}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.teamDomain,
    audience: config.audience,
  });
  return payload;
}

function authError(error: string, status: number): AccessAuthenticationResult {
  return {
    ok: false,
    response: Response.json(
      { error },
      {
        status,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    ),
  };
}

export async function authenticateAdminRequest(
  request: Request,
  env: unknown,
  verifier: AccessJwtVerifier = verifyCloudflareAccessJwt,
): Promise<AccessAuthenticationResult> {
  const config = readAccessJwtConfig(env);
  if (!config) {
    console.error(JSON.stringify({ error: "ADMIN_ACCESS_NOT_CONFIGURED" }));
    return authError("ADMIN_ACCESS_NOT_CONFIGURED", 503);
  }

  const token = request.headers.get(ACCESS_JWT_HEADER);
  if (!token) return authError("ACCESS_AUTHENTICATION_REQUIRED", 403);

  try {
    const payload = await verifier(token, config);
    if (typeof payload.email !== "string" || payload.email.length === 0) {
      return authError("ACCESS_IDENTITY_MISSING", 403);
    }
    return { ok: true, identity: { email: payload.email } };
  } catch (error) {
    console.error(JSON.stringify({
      error: "ACCESS_JWT_INVALID",
      reason: error instanceof Error ? error.name : "UnknownError",
    }));
    return authError("ACCESS_AUTHENTICATION_INVALID", 403);
  }
}
