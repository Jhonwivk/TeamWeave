import { cleanString, database, jsonBody, now, repoId, requireOwner } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

type RepositoryInput = { fullName?: string; defaultBranch?: string; visibility?: string };

export async function POST(request: Request) {
  const auth = requireOwner(request);
  if ("error" in auth) return auth.error;
  const payload = await jsonBody<RepositoryInput>(request);
  const fullName = cleanString(payload.fullName, 200).replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) return Response.json({ error: "Use owner/repository format" }, { status: 400 });
  const id = repoId();
  const createdAt = now();
  let defaultBranch = cleanString(payload.defaultBranch, 100) || "main";
  let visibility = ["public", "private"].includes(String(payload.visibility)) ? String(payload.visibility) : "unknown";
  try {
    const github = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "TeamWeave-Control-Plane" },
    });
    if (github.ok) {
      const metadata = await github.json() as { default_branch?: string; private?: boolean };
      defaultBranch = cleanString(metadata.default_branch, 100) || defaultBranch;
      visibility = metadata.private ? "private" : "public";
    } else if (github.status !== 404) {
      return Response.json({ error: `GitHub verification failed (${github.status})` }, { status: 502 });
    }
  } catch {
    // A private repository may be invisible to the public API; the local worker verifies it with gh.
  }
  try {
    await database().prepare("INSERT INTO repositories (id, owner_id, full_name, url, default_branch, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, auth.ownerId, fullName, `https://github.com/${fullName}.git`, defaultBranch, visibility, createdAt).run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) return Response.json({ error: "Repository is already connected" }, { status: 409 });
    throw error;
  }
  return Response.json({ repository: { id, fullName, url: `https://github.com/${fullName}.git`, defaultBranch, visibility, createdAt } }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = requireOwner(request);
  if ("error" in auth) return auth.error;
  const id = new URL(request.url).searchParams.get("id") || "";
  const active = await database().prepare("SELECT COUNT(*) AS count FROM tasks WHERE owner_id = ? AND repository_id = ? AND status NOT IN ('done','failed','cancelled')").bind(auth.ownerId, id).first<{ count: number }>();
  if ((active?.count || 0) > 0) return Response.json({ error: "Finish or cancel active tasks first" }, { status: 409 });
  await database().prepare("DELETE FROM repositories WHERE id = ? AND owner_id = ?").bind(id, auth.ownerId).run();
  return Response.json({ ok: true });
}
