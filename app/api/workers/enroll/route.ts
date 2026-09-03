import { cleanString, database, jsonBody, now, requireOwner, tokenHash, workerId } from "@/lib/control-plane";

export const dynamic = "force-dynamic";
type EnrollInput = { name?: string };

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return `amx_${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}

export async function POST(request: Request) {
  const auth = await requireOwner(request);
  if ("error" in auth) return auth.error;
  const payload = await jsonBody<EnrollInput>(request);
  const name = cleanString(payload.name, 100) || "Local Worker";
  const id = workerId(); const token = createToken(); const hash = await tokenHash(token); const createdAt = now();
  await database().prepare("INSERT INTO workers (id, owner_id, name, token_hash, platform, capabilities, created_at) VALUES (?, ?, ?, ?, 'pending', '[]', ?)")
    .bind(id, auth.ownerId, name, hash, createdAt).run();
  return Response.json({ worker: { id, name, createdAt }, token }, { status: 201 });
}
