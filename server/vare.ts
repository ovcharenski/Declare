import { createHash, randomBytes } from "node:crypto";
import { config } from "./config";

export type VareProfile = {
  id?: string;
  username?: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  badges?: unknown;
};

export type VareTokens = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
};

export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function generateState(): string {
  return randomBytes(24).toString("base64url");
}

export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: config.vare.clientId,
    redirect_uri: config.vare.redirectUri,
    response_type: "code",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: config.vare.scopes,
  });
  return `${config.vare.webClientUrl}/authorize?${params.toString()}`;
}

function basicAuthHeader(): string {
  const raw = `${config.vare.clientId}:${config.vare.clientSecret}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

async function postToken(data: Record<string, string>): Promise<Response> {
  const url = `${config.vare.apiBaseUrl}/oauth/token`;
  const form = new URLSearchParams(data);
  let resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  // Fallback to client_secret_post if the server rejects the Basic auth form.
  if (resp.status === 415 || resp.status === 400) {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        ...data,
        client_id: config.vare.clientId,
        client_secret: config.vare.clientSecret,
      }).toString(),
    });
  }
  return resp;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<VareTokens | null> {
  const data = {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.vare.redirectUri,
    code_verifier: codeVerifier,
  };
  const resp = await postToken(data);
  if (!resp.ok) return null;
  return (await resp.json()) as VareTokens;
}

export async function refreshTokens(
  refreshToken: string,
): Promise<VareTokens | null> {
  const data = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };
  const resp = await postToken(data);
  if (!resp.ok) return null;
  return (await resp.json()) as VareTokens;
}

export async function fetchProfile(
  accessToken: string,
): Promise<VareProfile | null> {
  const resp = await fetch(`${config.vare.apiBaseUrl}/api/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return null;
  return (await resp.json()) as VareProfile;
}

export function decodeSub(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export function resolveVareId(
  profile: VareProfile,
  accessToken: string,
): string | null {
  if (profile.id) return String(profile.id);
  return decodeSub(accessToken);
}

export function resolveUsername(profile: VareProfile): string {
  return profile.username?.trim() || "user";
}
