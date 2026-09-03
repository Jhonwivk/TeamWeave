import { database, parseJson, requireOwner } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if ("error" in auth) return auth.error;
  const db = database();
  const [repositories, workers, tasks, events, sessions, messages] = await Promise.all([
    db.prepare("SELECT id, full_name AS fullName, url, default_branch AS defaultBranch, visibility, created_at AS createdAt FROM repositories WHERE owner_id = ? ORDER BY created_at DESC").bind(auth.ownerId).all(),
    db.prepare("SELECT id, name, platform, capabilities, runtimes, last_seen_at AS lastSeenAt, created_at AS createdAt FROM workers WHERE owner_id = ? ORDER BY created_at DESC").bind(auth.ownerId).all(),
    db.prepare("SELECT id, repository_id AS repositoryId, title, prompt, actor, model, mode, execution_strategy AS executionStrategy, runtime, active_session_id AS activeSessionId, base_branch AS baseBranch, work_branch AS workBranch, status, worker_id AS workerId, attempt, summary, diff_stat AS diffStat, pr_url AS prUrl, error, created_at AS createdAt, updated_at AS updatedAt FROM tasks WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100").bind(auth.ownerId).all(),
    db.prepare("SELECT e.id, e.task_id AS taskId, e.kind, e.message, e.payload, e.created_at AS createdAt FROM task_events e JOIN tasks t ON t.id = e.task_id WHERE t.owner_id = ? ORDER BY e.created_at DESC LIMIT 300").bind(auth.ownerId).all(),
    db.prepare("SELECT s.id, s.task_id AS taskId, s.actor, s.role, s.model, s.ordinal, s.status, s.runtime, s.runtime_name AS runtimeName, s.workspace_id AS workspaceId, s.pane_id AS paneId, s.summary, s.created_at AS createdAt, s.updated_at AS updatedAt FROM agent_sessions s JOIN tasks t ON t.id = s.task_id WHERE t.owner_id = ? ORDER BY s.task_id, s.ordinal").bind(auth.ownerId).all(),
    db.prepare("SELECT m.id, m.task_id AS taskId, m.from_session_id AS fromSessionId, m.to_session_id AS toSessionId, m.kind, m.body, m.artifacts, m.git_ref AS gitRef, m.status, m.created_at AS createdAt, m.delivered_at AS deliveredAt, m.acknowledged_at AS acknowledgedAt FROM session_messages m JOIN tasks t ON t.id = m.task_id WHERE t.owner_id = ? ORDER BY m.created_at ASC LIMIT 500").bind(auth.ownerId).all(),
  ]);
  return Response.json({
    repositories: repositories.results,
    workers: workers.results.map((row: Record<string, unknown>) => ({ ...row, capabilities: parseJson(String(row.capabilities), []), runtimes: parseJson(String(row.runtimes), ["direct"]) })),
    tasks: tasks.results,
    events: events.results.map((row: Record<string, unknown>) => ({ ...row, payload: parseJson(String(row.payload || ""), null) })),
    sessions: sessions.results,
    messages: messages.results.map((row: Record<string, unknown>) => ({ ...row, artifacts: parseJson(String(row.artifacts || ""), []) })),
    serverTime: Date.now(),
  });
}
