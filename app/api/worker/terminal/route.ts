import { cleanString, database, jsonBody, now, requireWorker } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

type TerminalUpdate = {
  id?: string;
  status?: string;
  pid?: number | null;
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  exitCode?: number | null;
  error?: string | null;
};

type WorkerTerminalInput = {
  terminalId?: string;
  commandId?: string;
  kind?: string;
  data?: string;
  payload?: unknown;
  terminal?: TerminalUpdate;
};

const TERMINAL_STATUSES = ["queued", "starting", "running", "stopping", "exited", "stopped", "failed"];
const COMMAND_STATUSES = ["claimed", "done", "failed"];

function boundedData(value: unknown, max = 12000) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

export async function POST(request: Request) {
  const auth = await requireWorker(request);
  if ("error" in auth) return auth.error;
  const input = await jsonBody<WorkerTerminalInput>(request);
  const terminalId = cleanString(input.terminalId, 100);
  if (!terminalId) return Response.json({ error: "terminalId is required" }, { status: 400 });
  const terminal = await database().prepare(
    `SELECT t.id, t.owner_id AS ownerId, t.workspace_id AS workspaceId,
      t.worker_id AS workerId, t.status, w.status AS workspaceStatus
     FROM workspace_terminals t
     JOIN development_workspaces w ON w.id = t.workspace_id
     WHERE t.id = ? AND t.owner_id = ? AND t.worker_id = ?`
  ).bind(terminalId, auth.worker.ownerId, auth.worker.id).first<{ id: string; ownerId: string; workspaceId: string; workerId: string; status: string; workspaceStatus: string }>();
  if (!terminal) return Response.json({ error: "Assigned terminal not found" }, { status: 404 });

  const timestamp = now();
  const kind = cleanString(input.kind, 80) || "terminal.worker_update";
  const terminalStatus = TERMINAL_STATUSES.includes(String(input.terminal?.status)) ? String(input.terminal?.status) : null;
  const commandStatus = input.commandId && COMMAND_STATUSES.includes(String(input.terminal?.status))
    ? String(input.terminal?.status)
    : input.commandId && ["terminal.command_done", "terminal.input", "terminal.resize", "terminal.started", "terminal.stopped"].includes(kind)
      ? "done"
      : input.commandId && ["terminal.command_failed", "terminal.failed"].includes(kind) ? "failed" : null;
  const statements = [
    database().prepare("UPDATE workers SET last_seen_at = ? WHERE id = ?").bind(timestamp, auth.worker.id),
    database().prepare("UPDATE development_workspaces SET last_active_at = ?, updated_at = ? WHERE id = ? AND worker_id = ?").bind(timestamp, timestamp, terminal.workspaceId, auth.worker.id),
  ];

  const data = boundedData(input.data);
  const payload = input.payload == null ? null : JSON.stringify(input.payload).slice(0, 12000);
  if (kind !== "worker.heartbeat") {
    statements.push(database().prepare(
      `INSERT INTO workspace_terminal_events (owner_id, workspace_id, terminal_id, kind, data, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(terminal.ownerId, terminal.workspaceId, terminalId, kind, data, payload, timestamp));
  }

  if (input.commandId && commandStatus) {
    statements.push(database().prepare(
      `UPDATE workspace_terminal_commands SET status = ?, error = ?, completed_at = ?
       WHERE id = ? AND terminal_id = ? AND worker_id = ? AND status = 'claimed'`
    ).bind(commandStatus, cleanString(input.terminal?.error, 8000) || null, timestamp, cleanString(input.commandId, 100), terminalId, auth.worker.id));
  }

  if (terminalStatus || input.terminal) {
    statements.push(database().prepare(
      `UPDATE workspace_terminals SET status = COALESCE(?, status), pid = COALESCE(?, pid),
        shell = COALESCE(?, shell), cwd = COALESCE(?, cwd), cols = COALESCE(?, cols),
        rows = COALESCE(?, rows), exit_code = ?, error = ?, last_active_at = ?, updated_at = ?
       WHERE id = ? AND owner_id = ? AND worker_id = ?`
    ).bind(
      terminalStatus,
      typeof input.terminal?.pid === "number" ? input.terminal.pid : null,
      cleanString(input.terminal?.shell, 80) || null,
      cleanString(input.terminal?.cwd, 500) || null,
      typeof input.terminal?.cols === "number" ? input.terminal.cols : null,
      typeof input.terminal?.rows === "number" ? input.terminal.rows : null,
      typeof input.terminal?.exitCode === "number" ? input.terminal.exitCode : null,
      input.terminal?.error == null ? null : cleanString(input.terminal.error, 8000) || null,
      timestamp,
      timestamp,
      terminalId,
      terminal.ownerId,
      auth.worker.id,
    ));
  }

  await database().batch(statements);
  return Response.json({ ok: true });
}
