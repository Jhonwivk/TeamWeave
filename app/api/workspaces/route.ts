import { cleanString, database, jsonBody, now, requireOwner, workspaceId } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

type WorkspaceInput = {
  repositoryId?: string;
  baseBranch?: string;
  workingBranch?: string;
};

type WorkspaceRow = {
  id: string;
  repositoryId: string;
  workerId: string | null;
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

const ACTIVE_STATUSES = ["queued", "claiming", "preparing", "ready"];

function branchName(value: string, id: string) {
  const cleaned = value
    .replace(/[^A-Za-z0-9._/-]+/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/^[-/.]+|[-/.]+$/g, "")
    .slice(0, 180);
  return cleaned || `teamweave/workspace-${id.replace("ws_", "").slice(0, 12)}`;
}

async function listWorkspaces(ownerId: string) {
  const rows = await database().prepare(
    `SELECT w.id, w.repository_id AS repositoryId, w.worker_id AS workerId,
      w.local_path AS localPath, w.base_branch AS baseBranch,
      w.working_branch AS workingBranch, w.status, w.error,
      w.created_at AS createdAt, w.last_active_at AS lastActiveAt,
      w.updated_at AS updatedAt, r.full_name AS repository, r.url AS repositoryUrl
     FROM development_workspaces w
     JOIN repositories r ON r.id = w.repository_id
     WHERE w.owner_id = ?
     ORDER BY w.updated_at DESC`
  ).bind(ownerId).all<WorkspaceRow>();
  return rows.results;
}

export async function GET(request: Request) {
  const auth = requireOwner(request);
  if ("error" in auth) return auth.error;
  return Response.json({ workspaces: await listWorkspaces(auth.ownerId) });
}

export async function POST(request: Request) {
  const auth = requireOwner(request);
  if ("error" in auth) return auth.error;
  const payload = await jsonBody<WorkspaceInput>(request);
  const repositoryId = cleanString(payload.repositoryId, 100);
  if (!repositoryId) return Response.json({ error: "Repository is required" }, { status: 400 });

  const repository = await database().prepare(
    "SELECT id, full_name AS fullName, url, default_branch AS defaultBranch FROM repositories WHERE id = ? AND owner_id = ?"
  ).bind(repositoryId, auth.ownerId).first<{ id: string; fullName: string; url: string; defaultBranch: string }>();
  if (!repository) return Response.json({ error: "Repository not found" }, { status: 404 });

  const existing = await database().prepare(
    `SELECT w.id, w.repository_id AS repositoryId, w.worker_id AS workerId,
      w.local_path AS localPath, w.base_branch AS baseBranch,
      w.working_branch AS workingBranch, w.status, w.error,
      w.created_at AS createdAt, w.last_active_at AS lastActiveAt,
      w.updated_at AS updatedAt
     FROM development_workspaces w
     WHERE w.owner_id = ? AND w.repository_id = ?
       AND w.status IN ('queued', 'claiming', 'preparing', 'ready')
     ORDER BY w.updated_at DESC LIMIT 1`
  ).bind(auth.ownerId, repositoryId).first<WorkspaceRow>();
  if (existing) return Response.json({ workspace: { ...existing, repository: repository.fullName, repositoryUrl: repository.url }, reused: true });

  const id = workspaceId();
  const timestamp = now();
  const baseBranch = cleanString(payload.baseBranch, 100) || repository.defaultBranch;
  const workingBranch = branchName(cleanString(payload.workingBranch, 200), id);
  await database().batch([
    database().prepare(
      `INSERT INTO development_workspaces
        (id, owner_id, repository_id, base_branch, working_branch, status, created_at, last_active_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)`
    ).bind(id, auth.ownerId, repositoryId, baseBranch, workingBranch, timestamp, timestamp, timestamp),
    database().prepare(
      "INSERT INTO workspace_events (workspace_id, kind, message, payload, created_at) VALUES (?, 'workspace.created', 'Workspace queued for a local worker', ?, ?)"
    ).bind(id, JSON.stringify({ repository: repository.fullName, baseBranch, workingBranch }), timestamp),
  ]);
  return Response.json({
    workspace: {
      id,
      repositoryId,
      workerId: null,
      localPath: null,
      baseBranch,
      workingBranch,
      status: "queued",
      error: null,
      createdAt: timestamp,
      lastActiveAt: timestamp,
      updatedAt: timestamp,
      repository: repository.fullName,
      repositoryUrl: repository.url,
    },
    reused: false,
  }, { status: 201 });
}

export { ACTIVE_STATUSES };
