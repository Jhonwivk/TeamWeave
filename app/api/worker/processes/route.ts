import { cleanString, database, jsonBody, now, requireWorker } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

type ProcessSnapshot = {
  pid?: number;
  parentPid?: number | null;
  name?: string;
  command?: string;
  cwd?: string;
  startedAt?: number | null;
};

type PortSnapshot = {
  pid?: number | null;
  host?: string;
  port?: number;
  protocol?: string;
  label?: string;
};

type WorkspaceSnapshot = {
  workspaceId?: string;
  processes?: ProcessSnapshot[];
  ports?: PortSnapshot[];
};

type ProcessesInput = { snapshots?: WorkspaceSnapshot[] };

type WorkspaceRow = {
  id: string;
  repositoryId: string;
  workerId: string;
  localPath: string | null;
  baseBranch: string;
  workingBranch: string | null;
  status: string;
  error: string | null;
  createdAt: number;
  lastActiveAt: number;
  updatedAt: number;
  repository?: string;
  repositoryUrl?: string;
};

const ACTIVE_WORKSPACE_STATUSES = ["queued", "claiming", "preparing", "ready"];
const MAX_SNAPSHOTS = 20;
const MAX_ITEMS_PER_SNAPSHOT = 100;
const BATCH_SIZE = 80;

function integerInRange(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function safeKey(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 70);
}

function processId(workspaceId: string, pid: number) {
  return `proc_${safeKey(workspaceId)}_${pid}`;
}

function portId(workspaceId: string, protocol: string, port: number) {
  return `port_${safeKey(workspaceId)}_${protocol}_${port}`;
}

function safeHost(value: unknown) {
  const host = cleanString(value, 128) || "127.0.0.1";
  const normalized = host.toLowerCase();
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0", "::", "*"].includes(normalized)) return "127.0.0.1";
  return null;
}

async function listWorkspaces(ownerId: string, workerId: string) {
  const rows = await database().prepare(
    `SELECT w.id, w.repository_id AS repositoryId, w.worker_id AS workerId,
      w.local_path AS localPath, w.base_branch AS baseBranch,
      w.working_branch AS workingBranch, w.status, w.error,
      w.created_at AS createdAt, w.last_active_at AS lastActiveAt,
      w.updated_at AS updatedAt, r.full_name AS repository,
      r.url AS repositoryUrl
     FROM development_workspaces w
     JOIN repositories r ON r.id = w.repository_id
     WHERE w.owner_id = ? AND w.worker_id = ? AND w.status = 'ready'
     ORDER BY w.updated_at DESC LIMIT 100`
  ).bind(ownerId, workerId).all<WorkspaceRow>();
  return rows.results;
}

function isInsideWorkspace(cwd: string | null, localPath: string | null) {
  if (!cwd || !localPath) return false;
  const path = cwd.replace(/[\\/]$/, "");
  const root = localPath.replace(/[\\/]$/, "");
  return path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}\\`);
}

export async function POST(request: Request) {
  const auth = await requireWorker(request);
  if ("error" in auth) return auth.error;
  const input = await jsonBody<ProcessesInput>(request);
  const snapshots = Array.isArray(input.snapshots) ? input.snapshots.slice(0, MAX_SNAPSHOTS) : [];
  const timestamp = now();
  const db = database();
  const statements: D1PreparedStatement[] = [];

  for (const snapshot of snapshots) {
    const workspaceId = cleanString(snapshot?.workspaceId, 100);
    if (!workspaceId) continue;
    const workspace = await db.prepare(
      `SELECT w.id, w.local_path AS localPath
       FROM development_workspaces w
       WHERE w.id = ? AND w.owner_id = ? AND w.worker_id = ? AND w.status = 'ready'`
    ).bind(workspaceId, auth.worker.ownerId, auth.worker.id).first<{ id: string; localPath: string | null }>();
    if (!workspace) continue;

    const processes = Array.isArray(snapshot.processes) ? snapshot.processes.slice(0, MAX_ITEMS_PER_SNAPSHOT) : [];
    const ports = Array.isArray(snapshot.ports) ? snapshot.ports.slice(0, MAX_ITEMS_PER_SNAPSHOT) : [];
    const processIds = new Map<number, string>();
    statements.push(db.prepare(
      "UPDATE workspace_processes SET status = 'stale', updated_at = ? WHERE workspace_id = ? AND worker_id = ? AND status = 'running'"
    ).bind(timestamp, workspaceId, auth.worker.id));
    statements.push(db.prepare(
      "UPDATE workspace_ports SET status = 'stale', updated_at = ? WHERE workspace_id = ? AND worker_id = ? AND status = 'listening'"
    ).bind(timestamp, workspaceId, auth.worker.id));

    for (const item of processes) {
      const pid = integerInRange(item?.pid, 1, 4_000_000_000);
      if (!pid) continue;
      const cwd = cleanString(item.cwd, 500) || workspace.localPath;
      if (!isInsideWorkspace(cwd, workspace.localPath)) continue;
      const id = processId(workspaceId, pid);
      processIds.set(pid, id);
      const name = cleanString(item.name, 160) || "process";
      const command = cleanString(item.command, 1200) || name;
      const parentPid = integerInRange(item.parentPid, 1, 4_000_000_000);
      const startedAt = integerInRange(item.startedAt, 0, 4_102_444_800_000);
      statements.push(db.prepare(
        `INSERT INTO workspace_processes
          (id, owner_id, workspace_id, worker_id, pid, parent_pid, name, command, cwd, status, started_at, last_seen_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           worker_id = excluded.worker_id,
           parent_pid = excluded.parent_pid,
           name = excluded.name,
           command = excluded.command,
           cwd = excluded.cwd,
           status = 'running',
           started_at = COALESCE(workspace_processes.started_at, excluded.started_at),
           last_seen_at = excluded.last_seen_at,
           updated_at = excluded.updated_at`
      ).bind(id, auth.worker.ownerId, workspaceId, auth.worker.id, pid, parentPid, name, command, cwd, startedAt, timestamp, timestamp));
    }

    for (const item of ports) {
      const port = integerInRange(item?.port, 1, 65535);
      if (!port) continue;
      const protocol = String(item.protocol || "http").toLowerCase() === "https" ? "https" : "http";
      const pid = integerInRange(item.pid, 1, 4_000_000_000);
      const process = pid ? processIds.get(pid) || null : null;
      const host = safeHost(item.host);
      if (!host) continue;
      const label = cleanString(item.label, 160) || (process ? "Development server" : `Port ${port}`);
      const id = portId(workspaceId, protocol, port);
      const url = `${protocol}://localhost:${port}`;
      statements.push(db.prepare(
        `INSERT INTO workspace_ports
          (id, owner_id, workspace_id, worker_id, process_id, pid, host, port, protocol, label, url, status, first_seen_at, last_seen_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'listening', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           worker_id = excluded.worker_id,
           process_id = excluded.process_id,
           pid = excluded.pid,
           host = excluded.host,
           label = excluded.label,
           url = excluded.url,
           status = 'listening',
           last_seen_at = excluded.last_seen_at,
           updated_at = excluded.updated_at`
      ).bind(id, auth.worker.ownerId, workspaceId, auth.worker.id, process, pid, host, port, protocol, label, url, timestamp, timestamp, timestamp));
    }
    statements.push(db.prepare("UPDATE development_workspaces SET last_active_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND worker_id = ?").bind(timestamp, timestamp, workspaceId, auth.worker.ownerId, auth.worker.id));
  }

  statements.unshift(db.prepare("UPDATE workers SET last_seen_at = ? WHERE id = ?").bind(timestamp, auth.worker.id));
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await db.batch(statements.slice(index, index + BATCH_SIZE));
  }
  return Response.json({ ok: true, workspaces: await listWorkspaces(auth.worker.ownerId, auth.worker.id), reportedAt: timestamp, activeWorkspaceStatuses: ACTIVE_WORKSPACE_STATUSES });
}
