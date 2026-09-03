import { database, jsonBody, now, requireOwner } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

type ActionInput = { action?: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = requireOwner(request);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const payload = await jsonBody<ActionInput>(request);
  const workspace = await database().prepare(
    "SELECT id, status FROM development_workspaces WHERE id = ? AND owner_id = ?"
  ).bind(id, auth.ownerId).first<{ id: string; status: string }>();
  if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });
  const timestamp = now();

  if (payload.action === "delete" && ["stopped", "failed"].includes(workspace.status)) {
    const taskCount = await database().prepare("SELECT COUNT(*) AS count FROM tasks WHERE workspace_id = ?").bind(id).first<{ count: number }>();
    if ((taskCount?.count || 0) > 0) return Response.json({ error: "Workspace is referenced by tasks; delete those tasks first" }, { status: 409 });
    await database().batch([
      database().prepare("DELETE FROM workspace_events WHERE workspace_id = ?").bind(id),
      database().prepare("DELETE FROM development_workspaces WHERE id = ? AND owner_id = ?").bind(id, auth.ownerId),
    ]);
  } else if (payload.action === "stop" && ["queued", "claiming", "preparing", "ready", "failed"].includes(workspace.status)) {
    await database().batch([
      database().prepare("UPDATE development_workspaces SET status = 'stopped', updated_at = ?, last_active_at = ? WHERE id = ?").bind(timestamp, timestamp, id),
      database().prepare("INSERT INTO workspace_events (workspace_id, kind, message, created_at) VALUES (?, 'workspace.stopped', 'Workspace stopped by operator', ?)").bind(id, timestamp),
    ]);
  } else if (payload.action === "reopen" && ["stopped", "failed"].includes(workspace.status)) {
    await database().batch([
      database().prepare("UPDATE development_workspaces SET status = 'queued', worker_id = NULL, error = NULL, updated_at = ?, last_active_at = ? WHERE id = ?").bind(timestamp, timestamp, id),
      database().prepare("INSERT INTO workspace_events (workspace_id, kind, message, created_at) VALUES (?, 'workspace.reopened', 'Workspace queued again', ?)").bind(id, timestamp),
    ]);
  } else {
    return Response.json({ error: "Action is not valid for the current status" }, { status: 409 });
  }
  return Response.json({ ok: true });
}
