import { githubAuthorizeUrl, OAUTH_STATE_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return_to") || "/";
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  const state = crypto.randomUUID();
  const redirectUrl = githubAuthorizeUrl(request, `${state}:${safeReturnTo}`);

  return new Response(null, {
    status: 302,
    headers: {
      location: redirectUrl,
      "set-cookie": `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
}
