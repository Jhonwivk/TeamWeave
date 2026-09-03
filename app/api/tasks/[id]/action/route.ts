import { cleanString, database, jsonBody, messageId, now, requireOwner } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

type ActionInput = { action?: string; reply?: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = requireOwner(request);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const { action, reply } = await jsonBody<ActionInput>(request);
  const task = await database().prepare("SELECT status, attempt, active_session_id AS activeSessionId FROM tasks WHERE id = ? AND owner_id = ?").bind(id, auth.ownerId).first<{ status: string; attempt: number; activeSessionId: string | null }>();
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
  const timestamp = now();
  if (action === "approve" && task.status === "review") {
    await database().batch([
      database().prepare("UPDATE tasks SET status = 'publish_requested', updated_at = ? WHERE id = ?").bind(timestamp, id),
      database().prepare("INSERT INTO task_events (task_id, kind, message, created_at) VALUES (?, 'decision.approved', 'Approved; creating GitHub pull request', ?)").bind(id, timestamp),
    ]);
  } else if (action === "retry" && ["review", "failed"].includes(task.status)) {
    await database().batch([
      database().prepare("UPDATE tasks SET status = 'queued', worker_id = NULL, active_session_id = NULL, error = NULL, summary = NULL, diff_stat = NULL, attempt = ?, updated_at = ? WHERE id = ?").bind(task.attempt + 1, timestamp, id),
      database().prepare("UPDATE agent_sessions SET status = 'pending', runtime = NULL, runtime_name = NULL, workspace_id = NULL, pane_id = NULL, summary = NULL, updated_at = ? WHERE task_id = ?").bind(timestamp, id),
      database().prepare("INSERT INTO task_events (task_id, kind, message, created_at) VALUES (?, 'decision.retry', 'Changes requested; queued for another run', ?)").bind(id, timestamp),
    ]);
  } else if (action === "respond" && task.status === "blocked" && task.activeSessionId) {
    const body = cleanString(reply, 6000);
    if (!body) return Response.json({ error: "A response is required" }, { status: 400 });
    const idempotencyId = messageId();
    await database().batch([
      database().prepare("INSERT INTO session_messages (id, task_id, to_session_id, kind, body, artifacts, status, created_at) VALUES (?, ?, ?, 'operator.reply', ?, '[]', 'pending', ?)").bind(idempotencyId, id, task.activeSessionId, body, timestamp),
      database().prepare("UPDATE tasks SET status = 'resume_requested', error = NULL, updated_at = ? WHERE id = ?").bind(timestamp, id),
      database().prepare("INSERT INTO task_events (task_id, kind, message, payload, created_at) VALUES (?, 'operator.replied', 'Operator replied to blocked agent', ?, ?)").bind(id, JSON.stringify({ messageId: idempotencyId, sessionId: task.activeSessionId }), timestamp),
    ]);
  } else if (action === "cancel" && ["queued", "failed"].includes(task.status)) {
    await database().batch([
      database().prepare("UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(timestamp, id),
      database().prepare("INSERT INTO task_events (task_id, kind, message, created_at) VALUES (?, 'decision.cancelled', 'Task cancelled', ?)").bind(id, timestamp),
    ]);
  } else {
    return Response.json({ error: "Action is not valid for the current status" }, { status: 409 });
  }
  return Response.json({ ok: true });
}
