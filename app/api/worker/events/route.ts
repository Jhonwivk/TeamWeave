import { cleanString, database, jsonBody, now, requireWorker } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

type SessionUpdate = {
  id?: string;
  status?: string;
  runtime?: string;
  runtimeName?: string;
  workspaceId?: string;
  paneId?: string;
  summary?: string;
};

type SessionMessageInput = {
  id?: string;
  fromSessionId?: string | null;
  toSessionId?: string | null;
  kind?: string;
  body?: string;
  artifacts?: string[];
  gitRef?: string;
  status?: string;
};

type WorkspaceUpdate = {
  id?: string;
  status?: string;
  localPath?: string;
  workingBranch?: string;
  error?: string;
};

type EventInput = {
  taskId?: string;
  workspaceId?: string;
  kind?: string;
  message?: string;
  status?: string;
  activeSessionId?: string | null;
  summary?: string;
  diffStat?: string;
  workBranch?: string;
  prUrl?: string;
  error?: string;
  payload?: unknown;
  session?: SessionUpdate;
  sessionMessage?: SessionMessageInput;
  workspace?: WorkspaceUpdate;
};

async function sessionBelongsToTask(sessionId: string | null, taskId: string) {
  if (!sessionId) return true;
  return !!(await database().prepare("SELECT id FROM agent_sessions WHERE id = ? AND task_id = ?").bind(sessionId, taskId).first());
}

export async function POST(request: Request) {
  const auth = await requireWorker(request);
  if ("error" in auth) return auth.error;
  const input = await jsonBody<EventInput>(request);
  const taskId = cleanString(input.taskId, 100);
  const workspaceId = cleanString(input.workspaceId || input.workspace?.id, 100);
  if ((taskId && workspaceId) || (!taskId && !workspaceId)) return Response.json({ error: "Task or workspace is required" }, { status: 400 });
  const task = taskId
    ? await database().prepare("SELECT id, workspace_id AS workspaceId FROM tasks WHERE id = ? AND owner_id = ? AND worker_id = ?").bind(taskId, auth.worker.ownerId, auth.worker.id).first<{ id: string; workspaceId: string | null }>()
    : null;
  const workspace = workspaceId
    ? await database().prepare("SELECT id FROM development_workspaces WHERE id = ? AND owner_id = ? AND worker_id = ?").bind(workspaceId, auth.worker.ownerId, auth.worker.id).first<{ id: string }>()
    : null;
  if (taskId && !task) return Response.json({ error: "Assigned task not found" }, { status: 404 });
  if (workspaceId && !workspace) return Response.json({ error: "Assigned workspace not found" }, { status: 404 });

  const timestamp = now();
  const allowedStatuses = ["running", "blocked", "review", "done", "failed"];
  const status = allowedStatuses.includes(String(input.status)) ? String(input.status) : "";
  const kind = cleanString(input.kind, 80) || "worker.log";
  const statements = [
    database().prepare("UPDATE workers SET last_seen_at = ? WHERE id = ?").bind(timestamp, auth.worker.id),
  ];

  if (taskId) {
    statements.push(database().prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").bind(timestamp, taskId));
    if (task?.workspaceId) {
      statements.push(database().prepare("UPDATE development_workspaces SET last_active_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?").bind(timestamp, timestamp, task.workspaceId, auth.worker.ownerId));
    }
  }

  if (kind !== "worker.heartbeat") {
    if (workspaceId) {
      statements.push(database().prepare("INSERT INTO workspace_events (workspace_id, kind, message, payload, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(workspaceId, kind, cleanString(input.message, 6000) || "Worker update", input.payload == null ? null : JSON.stringify(input.payload).slice(0, 12000), timestamp));
    } else {
      statements.push(database().prepare("INSERT INTO task_events (task_id, kind, message, payload, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(taskId, kind, cleanString(input.message, 6000) || "Worker update", input.payload == null ? null : JSON.stringify(input.payload).slice(0, 12000), timestamp));
    }
  }

  if (workspaceId) {
    const workspaceStatus = ["queued", "claiming", "preparing", "ready", "stopped", "failed"].includes(String(input.workspace?.status))
      ? String(input.workspace?.status)
      : null;
    const localPath = cleanString(input.workspace?.localPath, 500) || null;
    const workingBranch = cleanString(input.workspace?.workingBranch, 200) || null;
    const error = cleanString(input.workspace?.error, 8000) || null;
    statements.push(database().prepare(
      "UPDATE development_workspaces SET status = COALESCE(?, status), local_path = COALESCE(?, local_path), working_branch = COALESCE(?, working_branch), error = ?, last_active_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND worker_id = ?"
    ).bind(workspaceStatus, localPath, workingBranch, error, timestamp, timestamp, workspaceId, auth.worker.ownerId, auth.worker.id));
    await database().batch(statements);
    return Response.json({ ok: true });
  }

  if (status) {
    const activeSessionId = typeof input.activeSessionId === "string" ? cleanString(input.activeSessionId, 100) || null : null;
    if (activeSessionId && !(await sessionBelongsToTask(activeSessionId, taskId))) return Response.json({ error: "Active session does not belong to task" }, { status: 400 });
    statements.push(database().prepare("UPDATE tasks SET status = ?, active_session_id = ?, summary = COALESCE(?, summary), diff_stat = COALESCE(?, diff_stat), work_branch = COALESCE(?, work_branch), pr_url = COALESCE(?, pr_url), error = ?, updated_at = ? WHERE id = ?")
      .bind(status, activeSessionId, cleanString(input.summary, 12000) || null, cleanString(input.diffStat, 12000) || null, cleanString(input.workBranch, 200) || null, cleanString(input.prUrl, 1000) || null, cleanString(input.error, 8000) || null, timestamp, taskId));
  }

  if (input.session) {
    const sessionId = cleanString(input.session.id, 100);
    if (!sessionId || !(await sessionBelongsToTask(sessionId, taskId))) return Response.json({ error: "Session does not belong to task" }, { status: 400 });
    const sessionStatus = ["pending", "starting", "working", "blocked", "done", "failed"].includes(String(input.session.status)) ? String(input.session.status) : null;
    const runtime = ["herdr", "direct"].includes(String(input.session.runtime)) ? String(input.session.runtime) : null;
    statements.push(database().prepare(
      "UPDATE agent_sessions SET status = COALESCE(?, status), runtime = COALESCE(?, runtime), runtime_name = COALESCE(?, runtime_name), workspace_id = COALESCE(?, workspace_id), pane_id = COALESCE(?, pane_id), summary = COALESCE(?, summary), updated_at = ? WHERE id = ? AND task_id = ?"
    ).bind(
      sessionStatus,
      runtime,
      cleanString(input.session.runtimeName, 100) || null,
      cleanString(input.session.workspaceId, 160) || null,
      cleanString(input.session.paneId, 160) || null,
      cleanString(input.session.summary, 12000) || null,
      timestamp,
      sessionId,
      taskId,
    ));
  }

  if (input.sessionMessage) {
    const sessionMessage = input.sessionMessage;
    const id = cleanString(sessionMessage.id, 100);
    const fromSessionId = typeof sessionMessage.fromSessionId === "string" ? cleanString(sessionMessage.fromSessionId, 100) || null : null;
    const toSessionId = typeof sessionMessage.toSessionId === "string" ? cleanString(sessionMessage.toSessionId, 100) || null : null;
    const body = cleanString(sessionMessage.body, 12000);
    if (!id || !body || !(await sessionBelongsToTask(fromSessionId, taskId)) || !(await sessionBelongsToTask(toSessionId, taskId))) {
      return Response.json({ error: "Invalid cross-session message" }, { status: 400 });
    }
    const messageStatus = ["pending", "delivered", "acknowledged"].includes(String(sessionMessage.status)) ? String(sessionMessage.status) : "pending";
    const artifacts = Array.isArray(sessionMessage.artifacts)
      ? sessionMessage.artifacts.map((item) => cleanString(item, 500)).filter(Boolean).slice(0, 100)
      : [];
    const deliveredAt = ["delivered", "acknowledged"].includes(messageStatus) ? timestamp : null;
    const acknowledgedAt = messageStatus === "acknowledged" ? timestamp : null;
    statements.push(database().prepare(
      `INSERT INTO session_messages (id, task_id, from_session_id, to_session_id, kind, body, artifacts, git_ref, status, created_at, delivered_at, acknowledged_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         delivered_at = COALESCE(excluded.delivered_at, session_messages.delivered_at),
         acknowledged_at = COALESCE(excluded.acknowledged_at, session_messages.acknowledged_at)`
    ).bind(
      id,
      taskId,
      fromSessionId,
      toSessionId,
      cleanString(sessionMessage.kind, 80) || "handoff",
      body,
      JSON.stringify(artifacts),
      cleanString(sessionMessage.gitRef, 100) || null,
      messageStatus,
      timestamp,
      deliveredAt,
      acknowledgedAt,
    ));
  }

  await database().batch(statements);
  return Response.json({ ok: true });
}
