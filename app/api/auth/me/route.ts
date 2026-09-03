import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ user: null }, { status: 401 });
  return Response.json({ user });
}
