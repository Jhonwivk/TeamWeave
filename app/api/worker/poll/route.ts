import { cleanString, database, jsonBody, now, parseJson, requireWorker } from "@/lib/control-plane";
import { ACTOR_IDS, actorSupportsRuntime } from "@/lib/actors";

export const dynamic = "force-dynamic";

type PollInput = { platform?: string; capabilities?: string[]; runtimes?: string[] };
type Candidate = Record<string, unknown> & { id: string; status: string; runtime: string };
type WorkspaceCandidate = Record<string, unknown> & { id: string; status: string };

async function hydrateWorkspace(candidate: WorkspaceCandidate) {
  const workspace = await database().prepare(
    `SELECT w.id, w.owner_id AS ownerId, w.repository_id AS repositoryId,
      w.worker_id AS workerId, w.local_path AS localPath,
      w.base_branch AS baseBranch, w.working_branch AS workingBranch,
      w.status, w.error, w.created_at AS createdAt,
      w.last_active_at AS lastActiveAt, w.updated_at AS updatedAt,
      r.full_name AS repository, r.url AS repositoryUrl
     FROM development_workspaces w
     JOIN repositories r ON r.id = w.repository_id
     WHERE w.id = ?`
  ).bind(candidate.id).first<Record<string, unknown>>();
  return workspace ? { ...workspace, operation: "workspace" } : null;
}

async function hydrateJob(candidate: Candidate, operation: "run" | "resume" | "publish") {
  const sessionQuery = "SELECT id, actor, role, model, ordinal, status, runtime, runtime_name AS runtimeName, workspace_id AS workspaceId, pane_id AS paneId, summary FROM agent_sessions WHERE task_id = ? ORDER BY ordinal";
  let sessions = await database().prepare(sessionQuery).bind(candidate.id).all<Record<string, unknown>>();
  if (!sessions.results.length) {
    const timestamp = now();
    const legacySessionId = `sess_legacy_${candidate.id.replace("task_", "").slice(0, 16)}`;
    await database().prepare("INSERT OR IGNORE INTO agent_sessions (id, task_id, actor, role, model, ordinal, status, created_at, updated_at) VALUES (?, ?, ?, 'Solo agent', ?, 0, 'pending', ?, ?)")
      .bind(legacySessionId, candidate.id, candidate.actor, candidate.model || null, timestamp, timestamp).run();
    sessions = await database().prepare(sessionQuery).bind(candidate.id).all<Record<string, unknown>>();
  }
  const messages = await database().prepare(
      "SELECT id, from_session_id AS fromSessionId, to_session_id AS toSessionId, kind, body, artifacts, git_ref AS gitRef, status, created_at AS createdAt, delivered_at AS deliveredAt, acknowledged_at AS acknowledgedAt FROM session_messages WHERE task_id = ? ORDER BY created_at"
    ).bind(candidate.id).all<Record<string, unknown>>();
  const workspace = candidate.workspaceId
    ? await database().prepare(
        `SELECT w.id, w.repository_id AS repositoryId, w.worker_id AS workerId,
          w.local_path AS localPath, w.base_branch AS baseBranch,
          w.working_branch AS workingBranch, w.status, w.error,
          w.created_at AS createdAt, w.last_active_at AS lastActiveAt,
          w.updated_at AS updatedAt, r.full_name AS repository,
          r.url AS repositoryUrl
         FROM development_workspaces w
         JOIN repositories r ON r.id = w.repository_id
         WHERE w.id = ?`
      ).bind(String(candidate.workspaceId)).first<Record<string, unknown>>()
    : null;
  return {
    ...candidate,
    operation,
    workspace,
    sessions: sessions.results,
    messages: messages.results.map((row) => ({ ...row, artifacts: parseJson(String(row.artifacts || ""), []) })),
  };
}

function supports(candidate: Candidate, sessions: Record<string, unknown>[], capabilities: string[], runtimes: string[]) {
  if (!sessions.length) return false;
  const actorReady = sessions.every((session) => {
    const actor = String(session.actor);
    return (ACTOR_IDS as readonly string[]).includes(actor) && capabilities.includes(actor);
  });
  if (!actorReady) return false;
  if (candidate.runtime === "herdr" || candidate.runtime === "direct") {
    const runtime = candidate.runtime;
    return runtimes.includes(runtime) && sessions.every((session) => actorSupportsRuntime(String(session.actor), runtime));
  }
  // Auto jobs may mix runtimes: Herdr-backed sessions stay persistent while
  // direct-only actors (for example Aider) use their one-shot CLI adapter.
  return sessions.every((session) =>
    (runtimes.includes("herdr") && actorSupportsRuntime(String(session.actor), "herdr")) ||
    (runtimes.includes("direct") && actorSupportsRuntime(String(session.actor), "direct"))
  );
}

export async function POST(request: Request) {
  const auth = await requireWorker(request);
  if ("error" in auth) return auth.error;
  const body = await jsonBody<PollInput>(request);
  const timestamp = now();
  const capabilities = Array.isArray(body.capabilities)
    ? body.capabilities.map((item) => String(item).toLowerCase()).filter((item, index, items) => (ACTOR_IDS as readonly string[]).includes(item) && items.indexOf(item) === index).slice(0, ACTOR_IDS.length)
    : [];
  const runtimes = Array.isArray(body.runtimes) ? body.runtimes.filter((item) => ["herdr", "direct"].includes(item)).slice(0, 2) : ["direct"];
  await database().prepare("UPDATE workers SET platform = ?, capabilities = ?, runtimes = ?, last_seen_at = ? WHERE id = ?")
    .bind(cleanString(body.platform, 120) || "unknown", JSON.stringify(capabilities), JSON.stringify(runtimes), timestamp, auth.worker.id).run();

  const recoverableWorkspace = await database().prepare(
    `SELECT id, status FROM development_workspaces
     WHERE owner_id = ? AND worker_id = ?
       AND status IN ('claiming', 'preparing')
       AND updated_at < ?
     ORDER BY updated_at ASC LIMIT 1`
  ).bind(auth.worker.ownerId, auth.worker.id, timestamp - 60000).first<WorkspaceCandidate>();
  if (recoverableWorkspace) {
    const hydrated = await hydrateWorkspace(recoverableWorkspace);
    if (hydrated) {
      await database().batch([
        database().prepare("UPDATE development_workspaces SET updated_at = ?, last_active_at = ? WHERE id = ? AND worker_id = ?").bind(timestamp, timestamp, recoverableWorkspace.id, auth.worker.id),
        database().prepare("INSERT INTO workspace_events (workspace_id, kind, message, created_at) VALUES (?, 'worker.recovered', 'Worker recovered an interrupted workspace', ?)").bind(recoverableWorkspace.id, timestamp),
      ]);
      return Response.json({ job: { id: recoverableWorkspace.id, operation: "workspace", workspace: { ...hydrated, status: recoverableWorkspace.status } } });
    }
  }

  const workspaceCandidates = await database().prepare(
    `SELECT w.id, w.status
     FROM development_workspaces w
     WHERE w.owner_id = ? AND w.status = 'queued'
       AND (w.worker_id IS NULL OR w.worker_id = ?)
     ORDER BY w.created_at ASC LIMIT 10`
  ).bind(auth.worker.ownerId, auth.worker.id).all<WorkspaceCandidate>();
  for (const candidate of workspaceCandidates.results) {
    const claimed = await database().prepare(
      "UPDATE development_workspaces SET status = 'claiming', worker_id = ?, updated_at = ?, last_active_at = ?, error = NULL WHERE id = ? AND status = 'queued' AND (worker_id IS NULL OR worker_id = ?)"
    ).bind(auth.worker.id, timestamp, timestamp, candidate.id, auth.worker.id).run();
    if (!claimed.meta.changes) continue;
    const hydrated = await hydrateWorkspace({ ...candidate, status: "claiming" });
    if (!hydrated) continue;
    await database().prepare("INSERT INTO workspace_events (workspace_id, kind, message, payload, created_at) VALUES (?, 'worker.claimed', ?, ?, ?)")
      .bind(candidate.id, `${auth.worker.name} claimed the workspace`, JSON.stringify({ workerId: auth.worker.id }), timestamp).run();
    return Response.json({ job: { id: candidate.id, operation: "workspace", workspace: { ...hydrated, status: "claiming", workerId: auth.worker.id } } });
  }

  const recoverable = await database().prepare(
    `SELECT t.id, t.title, t.prompt, t.actor, t.model, t.workspace_id AS workspaceId, t.mode AS executionMode, t.runtime,
      t.active_session_id AS activeSessionId, t.base_branch AS baseBranch,
      t.work_branch AS workBranch, t.status, t.attempt, r.full_name AS repository,
      r.url AS repositoryUrl
     FROM tasks t JOIN repositories r ON r.id = t.repository_id
     WHERE t.owner_id = ? AND t.worker_id = ?
       AND t.status IN ('claimed', 'running', 'publishing', 'resuming')
       AND (t.workspace_id IS NULL OR EXISTS (SELECT 1 FROM development_workspaces w WHERE w.id = t.workspace_id AND w.status = 'ready' AND w.worker_id = t.worker_id))
       AND t.updated_at < ?
     ORDER BY t.updated_at ASC LIMIT 1`
  ).bind(auth.worker.ownerId, auth.worker.id, timestamp - 60000).first<Candidate>();
  if (recoverable) {
    const hydrated = await hydrateJob(recoverable, recoverable.status === "publishing" ? "publish" : recoverable.status === "resuming" ? "resume" : "run");
    if (supports(recoverable, hydrated.sessions, capabilities, runtimes)) {
      await database().batch([
        database().prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").bind(timestamp, recoverable.id),
        database().prepare("INSERT INTO task_events (task_id, kind, message, created_at) VALUES (?, 'worker.recovered', 'Worker recovered an interrupted job', ?)").bind(recoverable.id, timestamp),
      ]);
      return Response.json({ job: hydrated });
    }
  }

  const candidates = await database().prepare(
    `SELECT t.id, t.title, t.prompt, t.actor, t.model, t.workspace_id AS workspaceId, t.mode AS executionMode, t.runtime,
      t.active_session_id AS activeSessionId, t.base_branch AS baseBranch,
      t.work_branch AS workBranch, t.status, t.attempt, r.full_name AS repository,
      r.url AS repositoryUrl
     FROM tasks t JOIN repositories r ON r.id = t.repository_id
     WHERE t.owner_id = ? AND t.status IN ('queued', 'publish_requested', 'resume_requested')
       AND (t.status != 'resume_requested' OR t.worker_id = ?)
       AND (t.workspace_id IS NULL OR EXISTS (SELECT 1 FROM development_workspaces w WHERE w.id = t.workspace_id AND w.status = 'ready' AND w.worker_id = COALESCE(t.worker_id, ?)))
     ORDER BY CASE t.status WHEN 'resume_requested' THEN 0 WHEN 'publish_requested' THEN 1 ELSE 2 END,
       t.created_at ASC LIMIT 25`
  ).bind(auth.worker.ownerId, auth.worker.id, auth.worker.id).all<Candidate>();

  for (const candidate of candidates.results) {
    const hydrated = await hydrateJob(candidate, candidate.status === "publish_requested" ? "publish" : candidate.status === "resume_requested" ? "resume" : "run");
    if (!supports(candidate, hydrated.sessions, capabilities, runtimes)) continue;
    const claimedStatus = candidate.status === "publish_requested" ? "publishing" : candidate.status === "resume_requested" ? "resuming" : "claimed";
    const claimed = await database().prepare("UPDATE tasks SET status = ?, worker_id = ?, updated_at = ? WHERE id = ? AND status = ?")
      .bind(claimedStatus, auth.worker.id, timestamp, candidate.id, candidate.status).run();
    if (!claimed.meta.changes) continue;
    await database().prepare("INSERT INTO task_events (task_id, kind, message, payload, created_at) VALUES (?, 'worker.claimed', ?, ?, ?)")
      .bind(candidate.id, `${auth.worker.name} claimed the ${hydrated.operation} job`, JSON.stringify({ workerId: auth.worker.id, runtime: candidate.runtime }), timestamp).run();
    return Response.json({ job: { ...hydrated, status: claimedStatus } });
  }

  return Response.json({ job: null, pollAfterMs: 3500 });
}
