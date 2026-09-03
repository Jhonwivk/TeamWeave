import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type AuthUser = {
  id: string;
  login: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
};

export const SESSION_COOKIE = "teamweave_session";
export const OAUTH_STATE_COOKIE = "teamweave_oauth_state";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const DEV_OWNER_ID = "dev-local";

type SessionPayload = AuthUser & { exp: number };

function authSecret() {
  return process.env.AUTH_SESSION_SECRET || process.env.GITHUB_OAUTH_CLIENT_SECRET || "teamweave-dev-secret";
}

function oauthConfigured() {
  return Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET);
}

function baseUrlFromRequest(request?: Request) {
  if (process.env.AUTH_BASE_URL) return process.env.AUTH_BASE_URL.replace(/\/$/, "");
  if (request) return new URL(request.url).origin;
  return "http://localhost:5173";
}

function toBase64Url(bytes: Uint8Array) {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sign(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(signature));
}

async function verify(data: string, signature: string) {
  const expected = await sign(data);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function createSessionToken(user: AuthUser) {
  const payload: SessionPayload = { ...user, exp: Date.now() + SESSION_TTL_MS };
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await sign(encoded);
  return `${encoded}.${signature}`;
}

export async function parseSessionToken(token: string | null | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if (!(await verify(encoded, signature))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as SessionPayload;
    if (!payload?.id || payload.exp <= Date.now()) return null;
    return {
      id: String(payload.id),
      login: String(payload.login || payload.id),
      email: payload.email ? String(payload.email) : null,
      name: payload.name ? String(payload.name) : null,
      avatarUrl: payload.avatarUrl ? String(payload.avatarUrl) : null,
    };
  } catch {
    return null;
  }
}

function parseCookieHeader(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function getUserFromRequest(request: Request): Promise<AuthUser | null> {
  const cookieHeader = request.headers.get("cookie");
  const token = parseCookieHeader(cookieHeader, SESSION_COOKIE);
  const user = await parseSessionToken(token);
  if (user) return user;
  if (!oauthConfigured()) {
    return {
      id: DEV_OWNER_ID,
      login: "dev",
      email: null,
      name: "Local Developer",
      avatarUrl: null,
    };
  }
  return null;
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const user = await parseSessionToken(token);
  if (user) return user;
  if (!oauthConfigured()) {
    return {
      id: DEV_OWNER_ID,
      login: "dev",
      email: null,
      name: "Local Developer",
      avatarUrl: null,
    };
  }
  return null;
}

export async function requireSessionUser(returnTo = "/"): Promise<AuthUser> {
  const user = await getSessionUser();
  if (user) return user;
  redirect(githubSignInPath(returnTo));
}

export function githubSignInPath(returnTo = "/") {
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return `/api/auth/github?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function githubSignOutPath(returnTo = "/") {
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return `/api/auth/signout?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function sessionCookieOptions(maxAge = SESSION_TTL_MS / 1000) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function oauthStateCookieOptions(maxAge = 600) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function githubAuthorizeUrl(request: Request, state: string) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("GITHUB_OAUTH_CLIENT_ID is not configured");
  const redirectUri = `${baseUrlFromRequest(request)}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGitHubCode(request: Request, code: string): Promise<AuthUser> {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GitHub OAuth is not configured");

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${baseUrlFromRequest(request)}/api/auth/callback`,
    }),
  });
  const tokenBody = await tokenResponse.json() as { access_token?: string; error?: string };
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new Error(tokenBody.error || "Could not exchange GitHub OAuth code");
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${tokenBody.access_token}`,
      "user-agent": "TeamWeave",
    },
  });
  const profile = await userResponse.json() as {
    id?: number;
    login?: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  };
  if (!userResponse.ok || !profile.id || !profile.login) {
    throw new Error("Could not load GitHub profile");
  }

  let email = profile.email || null;
  if (!email) {
    const emailResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${tokenBody.access_token}`,
        "user-agent": "TeamWeave",
      },
    });
    if (emailResponse.ok) {
      const emails = await emailResponse.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
      email = emails.find((item) => item.primary && item.verified)?.email
        || emails.find((item) => item.verified)?.email
        || emails[0]?.email
        || null;
    }
  }

  return {
    id: String(profile.id),
    login: profile.login,
    email,
    name: profile.name || profile.login,
    avatarUrl: profile.avatar_url || null,
  };
}

export function isOAuthConfigured() {
  return oauthConfigured();
}
