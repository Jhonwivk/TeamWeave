import {
  createSessionToken,
  exchangeGitHubCode,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

function parseCookieHeader(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error");
  const cookieState = parseCookieHeader(request.headers.get("cookie"), OAUTH_STATE_COOKIE);
  const [stateToken, returnTo = "/"] = state.split(":");
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

  if (error) {
    return Response.redirect(`${new URL(request.url).origin}/?auth_error=${encodeURIComponent(error)}`, 302);
  }
  if (!code || !stateToken || !cookieState || cookieState !== stateToken) {
    return Response.redirect(`${new URL(request.url).origin}/?auth_error=invalid_oauth_state`, 302);
  }

  try {
    const user = await exchangeGitHubCode(request, code);
    const token = await createSessionToken(user);
    const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${sessionCookieOptions().maxAge}`;
    const clearState = `${OAUTH_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

    return new Response(null, {
      status: 302,
      headers: {
        location: safeReturnTo,
        "set-cookie": [cookie, clearState].join(", "),
      },
    });
  } catch (callbackError) {
    const message = callbackError instanceof Error ? callbackError.message : "oauth_failed";
    return Response.redirect(`${new URL(request.url).origin}/?auth_error=${encodeURIComponent(message)}`, 302);
  }
}
