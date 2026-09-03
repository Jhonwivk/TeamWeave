import { cleanString, database, jsonBody, now, requireOwner, terminalCommandId, terminalId, parseJson } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

type TerminalAction = "start" | "input" | "resize" | "stop";
type TerminalInput = {
  action?: TerminalAction;
  terminalId?: string;
  data?: string;
  shell?: string;
  cols?: number;
  rows?: number;
};

const SHELLS = new Set(["bash", "zsh", "sh", "powershell", "pwsh", "cmd"]);

function numberInRange(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

async function workspaceForOwner(id: string, ownerId: string) {
  return database().prepare(
    `SELECT w.id, w.owner_id AS ownerId, w.repository_id AS repositoryId,
      w.worker_id AS workerId, w.local_path AS localPath, w.base_branch AS baseBranch,
      w.working_branch AS workingBranch, w.status, w.error,
      r.full_name AS repository, r.url AS repositoryUrl
     FROM development_workspaces w
     JOIN repositories r ON r.id = w.repository_id
     WHERE w.id = ? AND w.owner_id = ?`
  ).bind(id, ownerId).first<Record<string, unknown>>();
}

async function terminalForOwner(workspaceId: string, terminalIdValue: string, ownerId: string) {
  return database().prepare(
    `SELECT id, owner_id AS ownerId, workspace_id AS workspaceId, worker_id AS workerId,
      shell, cwd, cols, rows, pid, status, exit_code AS exitCode, error,
      created_at AS createdAt, last_active_at AS lastActiveAt, updated_at AS updatedAt
     FROM workspace_terminals
     WHERE id = ? AND workspace_id = ? AND owner_id = ?`
  ).bind(terminalIdValue, workspaceId, ownerId).first<Record<string, unknown>>();
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = requireOwner(request);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const workspace = await workspaceForOwner(id, auth.ownerId);
  if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });

  const url = new URL(request.url);
  const requestedTerminalId = cleanString(url.searchParams.get("terminalId"), 100);
  const requestedAfter = Number(url.searchParams.get("after") || 0);
  const after = Number.isFinite(requestedAfter) ? Math.max(0, Math.floor(requestedAfter)) : 0;
  const terminal = requestedTerminalId
    ? await terminalForOwner(id, requestedTerminalId, auth.ownerId)
    : await database().prepare(
        `SELECT id, owner_id AS ownerId, workspace_id AS workspaceId, worker_id AS workerId,
          shell, cwd, cols, rows, pid, status, exit_code AS exitCode, error,
          created_at AS createdAt, last_active_at AS lastActiveAt, updated_at AS updatedAt
         FROM workspace_terminals
         WHERE workspace_id = ? AND owner_id = ?
         ORDER BY updated_at DESC LIMIT 1`
      ).bind(id, auth.ownerId).first<Record<string, unknown>>();
  if (requestedTerminalId && !terminal) return Response.json({ error: "Terminal not found" }, { status: 404 });

  if (!terminal) return Response.json({ workspace, terminal: null, events: [], nextAfter: after });
  const events = await database().prepare(
    `SELECT id, owner_id AS ownerId, workspace_id AS workspaceId,
      terminal_id AS terminalId, kind, data, payload, created_at AS createdAt
     FROM workspace_terminal_events
     WHERE terminal_id = ? AND owner_id = ? AND id > ?
     ORDER BY id ASC LIMIT 500`
  ).bind(terminal.id, auth.ownerId, after).all<Record<string, unknown>>();
  const mappedEvents = events.results.map((event) => ({
    ...event,
    payload: parseJson(String(event.payload || ""), null),
  }));
  const nextAfter = mappedEvents.length ? Number((mappedEvents[mappedEvents.length - 1] as Record<string, unknown>).id || after) : after;
  return Response.json({ workspace, terminal, events: mappedEvents, nextAfter });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = requireOwner(request);
  if ("error" in auth) return auth.error;
  const { id: workspaceIdValue } = await context.params;
  const input = await jsonBody<TerminalInput>(request);
  const action = input.action || "start";
  if (!["start", "input", "resize", "stop"].includes(action)) {
    return Response.json({ error: "Unsupported terminal action" }, { status: 400 });
  }
  const workspace = await workspaceForOwner(workspaceIdValue, auth.ownerId);
  if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });
  if (workspace.status !== "ready" || !workspace.workerId || !workspace.localPath) {
    return Response.json({ error: "Workspace is not ready on a local worker yet" }, { status: 409 });
  }

  const timestamp = now();
  const db = database();
  if (action === "start") {
    const existing = await db.prepare(
      `SELECT id, owner_id AS ownerId, workspace_id AS workspaceId, worker_id AS workerId,
        shell, cwd, cols, rows, pid, status, exit_code AS exitCode, error,
        created_at AS createdAt, last_active_at AS lastActiveAt, updated_at AS updatedAt
       FROM workspace_terminals
       WHERE workspace_id = ? AND owner_id = ? AND status IN ('queued', 'starting', 'running', 'stopping')
       ORDER BY updated_at DESC LIMIT 1`
    ).bind(workspaceIdValue, auth.ownerId).first<Record<string, unknown>>();
    if (existing) return Response.json({ terminal: existing, reused: true });

    const idValue = terminalId();
    const shell = SHELLS.has(String(input.shell || "")) ? String(input.shell) : "bash";
    const cols = numberInRange(input.cols, 20, 300) || 120;
    const rows = numberInRange(input.rows, 5, 100) || 32;
    const command = terminalCommandId();
    const terminal = {
      id: idValue,
      ownerId: auth.ownerId,
      workspaceId: workspaceIdValue,
      workerId: workspace.workerId,
      shell,
      cwd: workspace.localPath,
      cols,
      rows,
      pid: null,
      status: "queued",
      exitCode: null,
      error: null,
      createdAt: timestamp,
      lastActiveAt: timestamp,
      updatedAt: timestamp,
    };
    await db.batch([
      db.prepare(
        `INSERT INTO workspace_terminals (id, owner_id, workspace_id, worker_id, shell, cwd, cols, rows, status, created_at, last_active_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`
      ).bind(idValue, auth.ownerId, workspaceIdValue, workspace.workerId, shell, workspace.localPath, cols, rows, timestamp, timestamp, timestamp),
      db.prepare(
        `INSERT INTO workspace_terminal_commands (id, owner_id, workspace_id, terminal_id, worker_id, kind, payload, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'start', ?, 'queued', ?)`
      ).bind(command, auth.ownerId, workspaceIdValue, idValue, workspace.workerId, JSON.stringify({ shell, cols, rows }), timestamp),
      db.prepare(
        `INSERT INTO workspace_terminal_events (owner_id, workspace_id, terminal_id, kind, data, payload, created_at)
         VALUES (?, ?, ?, 'terminal.queued', ?, ?, ?)`
      ).bind(auth.ownerId, workspaceIdValue, idValue, "Terminal queued on the local worker", JSON.stringify({ commandId: command }), timestamp),
    ]);
    return Response.json({ terminal, commandId: command }, { status: 201 });
  }

  const terminalIdValue = cleanString(input.terminalId, 100);
  if (!terminalIdValue) return Response.json({ error: "terminalId is required" }, { status: 400 });
  const terminal = await terminalForOwner(workspaceIdValue, terminalIdValue, auth.ownerId);
  if (!terminal) return Response.json({ error: "Terminal not found" }, { status: 404 });
  if (["exited", "failed", "stopped"].includes(String(terminal.status)) && action !== "stop") {
    return Response.json({ error: "Terminal is no longer running" }, { status: 409 });
  }

  let payload: Record<string, unknown> = {};
  if (action === "input") {
    if (typeof input.data !== "string" || input.data.length > 8000) return Response.json({ error: "Terminal input must be a string up to 8000 characters" }, { status: 400 });
    payload = { data: input.data };
  } else if (action === "resize") {
    const cols = numberInRange(input.cols, 20, 300);
    const rows = numberInRange(input.rows, 5, 100);
    if (!cols || !rows) return Response.json({ error: "Terminal size is invalid" }, { status: 400 });
    payload = { cols, rows };
  }
  const command = terminalCommandId();
  const nextStatus = action === "stop" ? "stopping" : terminal.status;
  await db.batch([
    db.prepare(
      `INSERT INTO workspace_terminal_commands (id, owner_id, workspace_id, terminal_id, worker_id, kind, payload, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?)`
    ).bind(command, auth.ownerId, workspaceIdValue, terminalIdValue, terminal.workerId, action, JSON.stringify(payload), timestamp),
    db.prepare(
      `UPDATE workspace_terminals SET status = ?, cols = COALESCE(?, cols), rows = COALESCE(?, rows), last_active_at = ?, updated_at = ?
       WHERE id = ? AND owner_id = ?`
    ).bind(nextStatus, action === "resize" ? payload.cols : null, action === "resize" ? payload.rows : null, timestamp, timestamp, terminalIdValue, auth.ownerId),
    db.prepare(
      `INSERT INTO workspace_terminal_events (owner_id, workspace_id, terminal_id, kind, data, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(auth.ownerId, workspaceIdValue, terminalIdValue, `terminal.${action}_queued`, action === "input" ? null : `Terminal ${action} queued on the local worker`, JSON.stringify({ commandId: command, ...payload }), timestamp),
  ]);
  return Response.json({ ok: true, commandId: command, terminal: { ...terminal, status: nextStatus, ...(action === "resize" ? payload : {}) } });
}
