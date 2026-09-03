import { cleanString, database, jsonBody, now, requireOwner, sessionId, taskId } from "@/lib/control-plane";
import { actorSupportsRuntime, getActor } from "@/lib/actors";

export const dynamic = "force-dynamic";

type StepInput = { actor?: string; role?: string; model?: string };
type TaskInput = { repositoryId?: string; workspaceId?: string; title?: string; prompt?: string; actor?: string; model?: string; baseBranch?: string; mode?: string; runtime?: string; steps?: StepInput[] };

export async function POST(request: Request) {
  const auth = requireOwner(request);
  if ("error" in auth) return auth.error;
  const payload = await jsonBody<TaskInput>(request);
  const title = cleanString(payload.title, 200);
  const prompt = cleanString(payload.prompt, 12000);
  const mode = payload.mode === "multi" ? "multi" : "single";
  const runtime = ["auto", "herdr", "direct"].includes(String(payload.runtime)) ? String(payload.runtime) : "auto";
  const actor = cleanString(payload.actor, 30).toLowerCase();
  const repositoryId = cleanString(payload.repositoryId, 100);
  const requestedWorkspaceId = cleanString(payload.workspaceId, 100);
  if (!title || !prompt || !repositoryId) return Response.json({ error: "Repository, title, and instructions are required" }, { status: 400 });
  const requestedSteps = mode === "multi" && Array.isArray(payload.steps) ? payload.steps.slice(0, 4) : [{ actor, role: "Solo agent", model: payload.model }];
  const steps = requestedSteps.map((step, ordinal) => ({
    id: sessionId(),
    actor: cleanString(step.actor, 30).toLowerCase(),
    role: cleanString(step.role, 80) || `Agent ${ordinal + 1}`,
    model: cleanString(step.model, 100) || null,
    ordinal,
  }));
  if (mode === "multi" && steps.length < 2) return Response.json({ error: "A multi-agent task needs at least two sessions" }, { status: 400 });
  if (!steps.length || steps.some((step) => !getActor(step.actor))) return Response.json({ error: "Unsupported actor in execution plan" }, { status: 400 });
  if (runtime !== "auto") {
    const incompatible = steps.find((step) => !actorSupportsRuntime(step.actor, runtime as "herdr" | "direct"));
    if (incompatible) {
      const actorName = getActor(incompatible.actor)?.name || incompatible.actor;
      return Response.json({ error: `${actorName} does not support the ${runtime} runtime` }, { status: 400 });
    }
  }
  const repository = await database().prepare("SELECT id, default_branch AS defaultBranch FROM repositories WHERE id = ? AND owner_id = ?").bind(repositoryId, auth.ownerId).first<{ id: string; defaultBranch: string }>();
  if (!repository) return Response.json({ error: "Repository not found" }, { status: 404 });
  let workspace: { id: string; status: string; baseBranch: string; workingBranch: string | null } | null = null;
  if (requestedWorkspaceId) {
    workspace = await database().prepare(
      "SELECT id, status, base_branch AS baseBranch, working_branch AS workingBranch FROM development_workspaces WHERE id = ? AND repository_id = ? AND owner_id = ?"
    ).bind(requestedWorkspaceId, repositoryId, auth.ownerId).first<{ id: string; status: string; baseBranch: string; workingBranch: string | null }>();
    if (!workspace) return Response.json({ error: "Workspace not found for repository" }, { status: 404 });
    if (["stopped", "failed"].includes(workspace.status)) return Response.json({ error: "Workspace is not available; reopen it before creating a task" }, { status: 409 });
  }
  const id = taskId(); const timestamp = now(); const baseBranch = cleanString(payload.baseBranch, 100) || repository.defaultBranch;
  const primary = steps[0];
  const statements = [
    database().prepare("INSERT INTO tasks (id, owner_id, repository_id, title, prompt, actor, model, workspace_id, mode, runtime, base_branch, status, attempt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 1, ?, ?)")
      .bind(id, auth.ownerId, repositoryId, title, prompt, primary.actor, primary.model, workspace?.id || null, mode, runtime, workspace?.baseBranch || baseBranch, timestamp, timestamp),
    ...steps.map((step) => database().prepare("INSERT INTO agent_sessions (id, task_id, actor, role, model, ordinal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)")
      .bind(step.id, id, step.actor, step.role, step.model, step.ordinal, timestamp, timestamp)),
    database().prepare("INSERT INTO task_events (task_id, kind, message, payload, created_at) VALUES (?, 'task.created', ?, ?, ?)")
      .bind(id, mode === "multi" ? `Queued ${steps.length}-agent workflow` : `Queued for ${primary.actor}`, JSON.stringify({ mode, runtime, sessions: steps.map(({ id: session, actor: stepActor, role }) => ({ id: session, actor: stepActor, role })) }), timestamp),
  ];
  await database().batch(statements);
  return Response.json({ task: { id, repositoryId, workspaceId: workspace?.id || null, title, prompt, actor: primary.actor, model: primary.model, mode, runtime, baseBranch: workspace?.baseBranch || baseBranch, workBranch: workspace?.workingBranch || null, status: "queued", attempt: 1, createdAt: timestamp, updatedAt: timestamp }, sessions: steps.map((step) => ({ ...step, taskId: id, status: "pending", createdAt: timestamp, updatedAt: timestamp })) }, { status: 201 });
}
