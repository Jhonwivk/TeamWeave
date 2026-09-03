#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { homedir, platform, arch, hostname } from "node:os";
import { join, resolve } from "node:path";

const CONTROL_URL = (process.env.AGENTMUX_URL || "").replace(/\/$/, "");
const TOKEN = process.env.AGENTMUX_TOKEN || "";
const ROOT = resolve(process.env.AGENTMUX_WORKDIR || join(homedir(), ".agentmux", "workspaces"));
const HERDR_TIMEOUT = Number(process.env.AGENTMUX_HERDR_TIMEOUT || 30 * 60 * 1000);
const ACTOR_DETECT = [
  { id: "pi", cli: "pi" },
  { id: "codex", cli: "codex" },
  { id: "claude", cli: "claude" },
  { id: "cursor", cli: "cursor" },
  { id: "aider", cli: "aider" },
  { id: "gemini", cli: "gemini" },
  { id: "opencode", cli: "opencode" },
  { id: "goose", cli: "goose" },
  { id: "amazon_q", cli: "q" },
  { id: "windsurf", cli: "windsurf" },
  { id: "copilot", cli: "copilot" },
  { id: "deepseek", cli: "dsh" },
];

if (!CONTROL_URL || !TOKEN) {
  console.error("Set AGENTMUX_URL and AGENTMUX_TOKEN before starting the worker.");
  process.exit(1);
}

const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function api(path, body) {
  const response = await fetch(`${CONTROL_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const childEnv = { ...process.env };
    delete childEnv.AGENTMUX_TOKEN;
    delete childEnv.AGENTMUX_SITE_TOKEN;
    if (options.actor) {
      delete childEnv.GH_TOKEN;
      delete childEnv.GITHUB_TOKEN;
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onOutput?.(text, "stdout");
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onOutput?.(text, "stderr");
    });
    child.on("error", rejectRun);
    child.on("close", (code) => resolveRun({ code: code ?? 1, stdout, stderr }));
  });
}

async function has(command) {
  try {
    const result = await run(command, ["--version"]);
    return result.code === 0;
  } catch {
    return false;
  }
}

async function detectCapabilities() {
  const names = [];
  for (const actor of ACTOR_DETECT) if (await has(actor.cli)) names.push(actor.id);
  return names;
}

async function detectRuntimes() {
  const runtimes = ["direct"];
  if (await has("herdr")) runtimes.unshift("herdr");
  return runtimes;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sendEvent(taskId, event) {
  try {
    await api("/api/worker/events", { taskId, ...event });
  } catch (error) {
    console.error("Could not send event:", error instanceof Error ? error.message : String(error));
  }
}

function parseJsonOutput(output) {
  const trimmed = output.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed.split("\n").reverse();
    for (const line of lines) {
      try {
        return JSON.parse(line);
      } catch {
        // Keep looking for the final JSON response.
      }
    }
    return null;
  }
}

function directActorCommand(session, prompt) {
  if (session.actor === "pi") {
    const args = ["--mode", "json", "--approve", "--no-session"];
    if (session.model) args.push("--model", String(session.model));
    return { command: "pi", args: [...args, prompt] };
  }
  if (session.actor === "codex") {
    const args = ["exec", "--json", "--sandbox", "workspace-write", "--ephemeral"];
    if (session.model) args.push("--model", String(session.model));
    return { command: "codex", args: [...args, prompt] };
  }
  if (session.actor === "claude") {
    const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"];
    if (session.model) args.push("--model", String(session.model));
    return { command: "claude", args: [...args, prompt] };
  }
  if (session.actor === "cursor") {
    const args = ["agent", "-p", prompt, "--output-format", "text"];
    if (session.model) args.splice(1, 0, "--model", String(session.model));
    return { command: "cursor", args };
  }
  if (session.actor === "aider") {
    const args = ["--message", prompt, "--yes-always", "--no-show-model-warnings"];
    if (session.model) args.unshift("--model", String(session.model));
    return { command: "aider", args };
  }
  if (session.actor === "gemini") {
    const args = ["-p", prompt];
    if (session.model) args.unshift("--model", String(session.model));
    return { command: "gemini", args };
  }
  if (session.actor === "opencode") {
    const args = ["run", prompt];
    if (session.model) args.unshift("--model", String(session.model));
    return { command: "opencode", args };
  }
  if (session.actor === "goose") {
    const args = ["run", "--prompt", prompt];
    if (session.model) args.push("--model", String(session.model));
    return { command: "goose", args };
  }
  if (session.actor === "amazon_q") {
    return { command: "q", args: ["chat", "--no-interactive", prompt] };
  }
  if (session.actor === "windsurf") {
    const args = ["-p", prompt];
    if (session.model) args.unshift("--model", String(session.model));
    return { command: "windsurf", args };
  }
  if (session.actor === "copilot") {
    const args = ["-p", prompt];
    if (session.model) args.unshift("--model", String(session.model));
    return { command: "copilot", args };
  }
  if (session.actor === "deepseek") {
    return { command: "dsh", args: ["--profile", "headless", prompt] };
  }
  throw new Error(`Unsupported actor: ${session.actor}`);
}

function herdrModelArgs(session) {
  if (!session.model) return [];
  if (session.actor === "codex") return ["--", "-m", String(session.model)];
  return ["--", "--model", String(session.model)];
}

function promptFor(job, session, incoming, options = {}) {
  const parallel = options.parallel === true;
  const prior = incoming.length
    ? [
        "",
        "Upstream session handoffs:",
        ...incoming.map((message, index) => {
          const artifacts = Array.isArray(message.artifacts) && message.artifacts.length
            ? `\nArtifacts: ${message.artifacts.join(", ")}`
            : "";
          const gitRef = message.gitRef ? `\nGit ref: ${message.gitRef}` : "";
          return `--- Handoff ${index + 1} ---\n${message.body}${artifacts}${gitRef}`;
        }),
      ]
    : [];
  return [
    `Task: ${job.title}`,
    `Your role: ${session.role}`,
    `Stage: ${Number(session.ordinal) + 1} of ${job.sessions.length}`,
    parallel ? "Execution mode: parallel worktree" : "Execution mode: sequential handoff",
    "",
    job.prompt,
    ...prior,
    "",
    "Work only inside this repository and current branch. Inspect upstream changes before editing.",
    "Make the smallest coherent change and run relevant checks.",
    "Do not push, merge, create a pull request, or alter git remotes. TeamWeave owns Git delivery.",
    parallel
      ? "You are running in an isolated worktree. Focus on your role and leave branch integration to TeamWeave."
      : "At the end, give a concise handoff: decisions, changed files, checks, risks, and what the next agent should do.",
  ].join("\n");
}

async function prepareRepository(job) {
  await mkdir(ROOT, { recursive: true });
  const repositoryDir = join(ROOT, String(job.repository).replace("/", "__"));
  const gitDir = join(repositoryDir, ".git");
  if (!(await exists(gitDir))) {
    console.log(`Cloning ${job.repository}...`);
    const ghReady = await has("gh");
    const result = ghReady
      ? await run("gh", ["repo", "clone", job.repository, repositoryDir, "--", "--filter=blob:none"])
      : await run("git", ["clone", "--filter=blob:none", job.repositoryUrl, repositoryDir]);
    if (result.code !== 0) throw new Error(result.stderr || "Repository clone failed");
  }

  await run("git", ["fetch", "origin", "--prune"], { cwd: repositoryDir });
  const branch = job.workBranch || `teamweave/${String(job.id).replace("task_", "").slice(0, 12)}`;
  const current = await run("git", ["branch", "--show-current"], { cwd: repositoryDir });
  if (current.stdout.trim() !== branch) {
    const dirty = await run("git", ["status", "--porcelain"], { cwd: repositoryDir });
    if (dirty.stdout.trim()) throw new Error(`Workspace has uncommitted changes on ${current.stdout.trim() || "detached HEAD"}; resume on the original worker or clean it manually.`);
    const remoteBranch = await run("git", ["rev-parse", "--verify", `origin/${branch}`], { cwd: repositoryDir });
    const startPoint = remoteBranch.code === 0 ? `origin/${branch}` : `origin/${job.baseBranch}`;
    const checkout = await run("git", ["checkout", "-B", branch, startPoint], { cwd: repositoryDir });
    if (checkout.code !== 0) throw new Error(checkout.stderr || "Could not create isolated branch");
  }
  await run("git", ["config", "user.name", "TeamWeave Worker"], { cwd: repositoryDir });
  await run("git", ["config", "user.email", "teamweave-worker@users.noreply.github.com"], { cwd: repositoryDir });
  return { repositoryDir, branch };
}

async function prepareSessionWorktree(job, session, repositoryDir, integrationBranch) {
  const worktreeRoot = join(repositoryDir, ".teamweave-worktrees");
  await mkdir(worktreeRoot, { recursive: true });
  const worktreePath = join(worktreeRoot, session.id);
  const sessionBranch = `${integrationBranch}--sess-${session.ordinal}`;
  const gitMarker = join(worktreePath, ".git");
  if (!(await exists(gitMarker))) {
    const add = await run("git", ["worktree", "add", "-B", sessionBranch, worktreePath, `origin/${job.baseBranch}`], { cwd: repositoryDir });
    if (add.code !== 0) throw new Error(add.stderr || `Could not create worktree for ${session.role}`);
  } else {
    await run("git", ["checkout", sessionBranch], { cwd: worktreePath });
    const reset = await run("git", ["reset", "--hard", `origin/${job.baseBranch}`], { cwd: worktreePath });
    if (reset.code !== 0) throw new Error(reset.stderr || `Could not reset worktree for ${session.role}`);
  }
  await run("git", ["config", "user.name", "TeamWeave Worker"], { cwd: worktreePath });
  await run("git", ["config", "user.email", "teamweave-worker@users.noreply.github.com"], { cwd: worktreePath });
  return { worktreePath, sessionBranch };
}

async function mergeSessionBranch(repositoryDir, sessionBranch, integrationBranch) {
  await run("git", ["checkout", integrationBranch], { cwd: repositoryDir });
  const merge = await run("git", ["merge", "--no-edit", sessionBranch], { cwd: repositoryDir });
  if (merge.code !== 0) {
    await run("git", ["merge", "--abort"], { cwd: repositoryDir });
    throw new Error(`Could not merge parallel session branch ${sessionBranch}: ${(merge.stderr || merge.stdout).slice(-2000)}`);
  }
}

function streamReporter(taskId, sessionId) {
  let buffer = "";
  let timer;
  const flush = async () => {
    if (!buffer.trim()) return;
    const message = buffer.trim().slice(-5500);
    buffer = "";
    await sendEvent(taskId, { kind: "actor.output", message, payload: { sessionId } });
  };
  return {
    add(text) {
      buffer += text;
      if (buffer.length > 5000) void flush();
      if (!timer) timer = setInterval(() => void flush(), 1400);
    },
    async close() {
      if (timer) clearInterval(timer);
      await flush();
    },
  };
}

async function incomingMessages(job, session) {
  const incoming = (job.messages || []).filter((message) => message.toSessionId === session.id && ["handoff", "operator.reply"].includes(message.kind) && message.status !== "acknowledged");
  for (const message of incoming.filter((item) => item.status === "pending" && item.kind === "handoff")) {
    await sendEvent(job.id, {
      kind: "session.message_delivered",
      message: `Handoff delivered to ${session.role}`,
      sessionMessage: { ...message, status: "delivered" },
    });
    message.status = "delivered";
  }
  return incoming.filter((message) => message.kind === "handoff");
}

function handoffId(job, fromSession, toSession) {
  return `msg_${String(job.id).replace("task_", "")}_${fromSession.ordinal}_${toSession.ordinal}_${job.attempt}`;
}

async function createHandoff(job, fromSession, toSession, body, artifacts, gitRef) {
  const message = {
    id: handoffId(job, fromSession, toSession),
    fromSessionId: fromSession.id,
    toSessionId: toSession.id,
    kind: "handoff",
    body: body.slice(-12000),
    artifacts,
    gitRef,
    status: "pending",
  };
  await sendEvent(job.id, {
    kind: "session.handoff",
    message: `${fromSession.role} handed work to ${toSession.role}`,
    payload: { fromSessionId: fromSession.id, toSessionId: toSession.id, artifacts, gitRef },
    sessionMessage: message,
  });
  job.messages = [...(job.messages || []).filter((item) => item.id !== message.id), message];
}

async function acknowledgeHandoffs(job, session) {
  const delivered = (job.messages || []).filter((message) => message.toSessionId === session.id && message.kind === "handoff" && message.status === "delivered");
  for (const message of delivered) {
    await sendEvent(job.id, {
      kind: "session.message_acknowledged",
      message: `${session.role} acknowledged the upstream handoff`,
      sessionMessage: { ...message, status: "acknowledged" },
    });
    message.status = "acknowledged";
  }
}

async function commitSession(job, session, repositoryDir) {
  const status = await run("git", ["status", "--porcelain"], { cwd: repositoryDir });
  if (!status.stdout.trim()) {
    const sha = await run("git", ["rev-parse", "--short", "HEAD"], { cwd: repositoryDir });
    return { artifacts: [], gitRef: sha.stdout.trim(), diffStat: "No file changes" };
  }
  const diff = await run("git", ["diff", "--stat", "HEAD"], { cwd: repositoryDir });
  await run("git", ["add", "-A"], { cwd: repositoryDir });
  const commit = await run("git", ["commit", "-m", `teamweave: ${session.role.slice(0, 32)} · ${job.title.slice(0, 48)}`], { cwd: repositoryDir });
  if (commit.code !== 0) throw new Error(commit.stderr || "Could not commit agent changes");
  const [sha, files] = await Promise.all([
    run("git", ["rev-parse", "--short", "HEAD"], { cwd: repositoryDir }),
    run("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], { cwd: repositoryDir }),
  ]);
  return {
    artifacts: files.stdout.split("\n").map((item) => item.trim()).filter(Boolean),
    gitRef: sha.stdout.trim(),
    diffStat: diff.stdout.trim() || "Changes committed",
  };
}

async function markSession(job, session, status, extra = {}) {
  Object.assign(session, { status, ...extra });
  await sendEvent(job.id, {
    status: status === "blocked" ? "blocked" : "running",
    activeSessionId: status === "done" ? null : session.id,
    kind: `session.${status}`,
    message: `${session.role} · ${session.actor} · ${status}`,
    session: {
      id: session.id,
      status,
      runtime: extra.runtime || session.runtime,
      runtimeName: extra.runtimeName || session.runtimeName,
      workspaceId: extra.workspaceId || session.workspaceId,
      paneId: extra.paneId || session.paneId,
      summary: extra.summary,
    },
  });
}

async function runDirectSession(job, session, repositoryDir, options = {}) {
  const incoming = await incomingMessages(job, session);
  const prompt = promptFor(job, session, incoming, options);
  await markSession(job, session, "working", { runtime: "direct", runtimeName: `direct:${session.id}` });
  const adapter = directActorCommand(session, prompt);
  const reporter = streamReporter(job.id, session.id);
  let result;
  try {
    result = await run(adapter.command, adapter.args, {
      cwd: repositoryDir,
      actor: true,
      onOutput: (text) => reporter.add(text),
    });
  } finally {
    await reporter.close();
  }
  if (result.code !== 0) throw new Error((result.stderr || result.stdout || `${session.actor} exited with code ${result.code}`).slice(-7000));
  const summary = result.stdout.trim().split("\n").slice(-40).join("\n").slice(-10000) || `${session.actor} completed the ${session.role} stage.`;
  const git = await commitSession(job, session, repositoryDir);
  await acknowledgeHandoffs(job, session);
  await markSession(job, session, "done", { runtime: "direct", summary });
  return { summary, ...git };
}

function herdrAgentName(job, session) {
  return `amx_${String(job.id).replace("task_", "").slice(-8)}_${session.ordinal}`.toLowerCase();
}

async function herdrCommand(args, options = {}) {
  const result = await run("herdr", args, options);
  if (result.code !== 0) throw new Error((result.stderr || result.stdout || `herdr ${args.join(" ")} failed`).slice(-7000));
  return result;
}

async function createHerdrWorkspace(job, repositoryDir) {
  const created = await herdrCommand(["workspace", "create", "--cwd", repositoryDir, "--label", `amx-${String(job.id).slice(-8)}`, "--no-focus"]);
  const payload = parseJsonOutput(created.stdout);
  const workspaceId = payload?.result?.workspace?.workspace_id || payload?.result?.workspace?.id;
  const rootPaneId = payload?.result?.root_pane?.pane_id;
  if (!workspaceId || !rootPaneId) throw new Error("Herdr did not return a workspace and root pane ID");
  return { workspaceId: String(workspaceId), rootPaneId: String(rootPaneId) };
}

async function ensureHerdrPane(job, session, repositoryDir, workspaceState) {
  if (session.paneId && session.workspaceId) return { paneId: session.paneId, workspaceId: session.workspaceId };
  if (!workspaceState.workspaceId) Object.assign(workspaceState, await createHerdrWorkspace(job, repositoryDir));
  let paneId;
  if (!workspaceState.usedRoot) {
    paneId = workspaceState.rootPaneId;
    workspaceState.usedRoot = true;
  } else {
    const anchor = workspaceState.rootPaneId || job.sessions.find((item) => item.paneId)?.paneId;
    if (!anchor) throw new Error("No Herdr pane is available to split");
    const split = await herdrCommand(["pane", "split", anchor, "--direction", Number(session.ordinal) % 2 ? "right" : "down", "--no-focus"]);
    const payload = parseJsonOutput(split.stdout);
    paneId = payload?.result?.pane?.pane_id;
  }
  if (!paneId) throw new Error("Herdr did not return a pane ID");
  return { paneId: String(paneId), workspaceId: String(workspaceState.workspaceId) };
}

async function herdrAgentStatus(name) {
  const result = await run("herdr", ["agent", "get", name]);
  if (result.code !== 0) return null;
  return parseJsonOutput(result.stdout)?.result?.agent || null;
}

async function ensureHerdrAgent(job, session, repositoryDir, workspaceState) {
  const runtimeName = session.runtimeName || herdrAgentName(job, session);
  const existing = await herdrAgentStatus(runtimeName);
  if (existing) {
    const paneId = session.paneId || existing.pane_id;
    const workspaceId = session.workspaceId || existing.workspace_id || (typeof paneId === "string" ? paneId.split(":")[0] : null);
    return { runtimeName, paneId, workspaceId };
  }
  const location = await ensureHerdrPane(job, session, repositoryDir, workspaceState);
  await markSession(job, session, "starting", { runtime: "herdr", runtimeName, ...location });
  await herdrCommand(["agent", "start", runtimeName, "--kind", session.actor, "--pane", location.paneId, "--timeout", "120000", ...herdrModelArgs(session)], { cwd: repositoryDir, actor: true });
  return { runtimeName, ...location };
}

async function settleHerdrAgent(runtimeName) {
  const settled = await herdrCommand([
    "agent", "wait", runtimeName,
    "--until", "idle",
    "--until", "done",
    "--until", "blocked",
    "--timeout", String(HERDR_TIMEOUT),
  ]);
  const payload = parseJsonOutput(settled.stdout);
  return payload?.result?.agent || await herdrAgentStatus(runtimeName);
}

async function readHerdrAgent(runtimeName) {
  const result = await herdrCommand(["agent", "read", runtimeName, "--source", "recent-unwrapped", "--lines", "160"]);
  return result.stdout.trim().slice(-12000);
}

async function pendingOperatorReply(job, session) {
  return (job.messages || []).find((message) => message.toSessionId === session.id && message.kind === "operator.reply" && message.status === "pending");
}

async function runHerdrSession(job, session, repositoryDir, workspaceState) {
  const location = await ensureHerdrAgent(job, session, repositoryDir, workspaceState);
  Object.assign(session, { runtime: "herdr", ...location });
  let agent;

  if (session.status === "blocked") {
    const reply = await pendingOperatorReply(job, session);
    if (!reply) throw new Error(`${session.role} is blocked and needs an operator response`);
    await herdrCommand(["pane", "send-text", location.paneId, reply.body]);
    await herdrCommand(["agent", "send-keys", location.runtimeName, "enter"]);
    await sendEvent(job.id, {
      kind: "operator.reply_delivered",
      message: `Operator response delivered to ${session.role}`,
      sessionMessage: { ...reply, status: "delivered" },
    });
    reply.status = "delivered";
    await markSession(job, session, "working", { runtime: "herdr", ...location });
    agent = await settleHerdrAgent(location.runtimeName);
  } else if (session.status === "working") {
    agent = await settleHerdrAgent(location.runtimeName);
  } else {
    const incoming = await incomingMessages(job, session);
    const prompt = promptFor(job, session, incoming);
    await markSession(job, session, "working", { runtime: "herdr", ...location });
    const prompted = await herdrCommand([
      "agent", "prompt", location.runtimeName, prompt,
      "--wait",
      "--until", "idle",
      "--until", "done",
      "--until", "blocked",
      "--timeout", String(HERDR_TIMEOUT),
    ]);
    agent = parseJsonOutput(prompted.stdout)?.result?.agent || await herdrAgentStatus(location.runtimeName);
  }

  const summary = await readHerdrAgent(location.runtimeName);
  if (agent?.status === "blocked") {
    await markSession(job, session, "blocked", { runtime: "herdr", ...location, summary });
    return { blocked: true, summary };
  }

  const reply = (job.messages || []).find((message) => message.toSessionId === session.id && message.kind === "operator.reply" && message.status === "delivered");
  if (reply) {
    await sendEvent(job.id, {
      kind: "operator.reply_acknowledged",
      message: `${session.role} continued after operator response`,
      sessionMessage: { ...reply, status: "acknowledged" },
    });
    reply.status = "acknowledged";
  }
  const git = await commitSession(job, session, repositoryDir);
  await acknowledgeHandoffs(job, session);
  await markSession(job, session, "done", { runtime: "herdr", ...location, summary });
  return { blocked: false, summary: summary || `${session.actor} completed the ${session.role} stage.`, ...git };
}

async function runWorkflow(job) {
  if (job.executionStrategy === "parallel" && job.sessions.length > 1) {
    return runWorkflowParallel(job);
  }
  const heartbeat = setInterval(() => void sendEvent(job.id, { kind: "worker.heartbeat", message: "running" }), 10000);
  try {
    const { repositoryDir, branch } = await prepareRepository(job);
    const installedRuntimes = await detectRuntimes();
    let runtime = job.runtime === "direct" ? "direct" : installedRuntimes.includes("herdr") ? "herdr" : "direct";
    if (job.runtime === "herdr" && runtime !== "herdr") throw new Error("This task requires Herdr. Install Herdr, start it once, and retry.");
    await sendEvent(job.id, {
      status: "running",
      activeSessionId: job.activeSessionId || job.sessions.find((session) => session.status !== "done")?.id || null,
      kind: "runtime.selected",
      message: `${runtime === "herdr" ? "Herdr persistent runtime" : "Direct CLI fallback"} selected for ${job.sessions.length} session${job.sessions.length === 1 ? "" : "s"}`,
      workBranch: branch,
      payload: { runtime, mode: job.executionMode },
    });

    const existingWorkspace = job.sessions.find((session) => session.workspaceId);
    const rootSession = job.sessions.find((session) => session.paneId);
    const workspaceState = {
      workspaceId: existingWorkspace?.workspaceId || null,
      rootPaneId: rootSession?.paneId || null,
      usedRoot: !!rootSession,
    };
    let finalSummary = "";
    const diffStats = [];

    for (let index = 0; index < job.sessions.length; index += 1) {
      const session = job.sessions[index];
      if (session.status === "done") {
        finalSummary = session.summary || finalSummary;
        continue;
      }
      let result;
      try {
        result = runtime === "herdr"
          ? await runHerdrSession(job, session, repositoryDir, workspaceState)
          : await runDirectSession(job, session, repositoryDir);
      } catch (error) {
        if (runtime === "herdr" && job.runtime === "auto" && session.status !== "blocked") {
          await sendEvent(job.id, {
            kind: "runtime.fallback",
            message: `Herdr was unavailable; continuing ${session.role} with direct CLI`,
            payload: { reason: error instanceof Error ? error.message : String(error) },
          });
          runtime = "direct";
          session.status = "pending";
          result = await runDirectSession(job, session, repositoryDir);
        } else {
          throw error;
        }
      }
      if (result.blocked) return;
      finalSummary = result.summary || finalSummary;
      if (result.diffStat) diffStats.push(`${session.role}: ${result.diffStat}`);
      const nextSession = job.sessions[index + 1];
      if (nextSession) await createHandoff(job, session, nextSession, result.summary, result.artifacts || [], result.gitRef || "");
    }

    const push = await run("git", ["push", "--force-with-lease", "-u", "origin", branch], { cwd: repositoryDir });
    if (push.code !== 0) throw new Error(push.stderr || "Could not push isolated branch. Run 'gh auth setup-git' and retry.");
    const compareUrl = `https://github.com/${job.repository}/compare/${encodeURIComponent(job.baseBranch)}...${encodeURIComponent(branch)}?expand=1`;
    await sendEvent(job.id, {
      status: "review",
      activeSessionId: null,
      kind: "workflow.completed",
      message: `${job.sessions.length}-session workflow complete; branch is ready for review`,
      summary: finalSummary || "All agent sessions completed.",
      diffStat: diffStats.join("\n") || "No file changes",
      workBranch: branch,
      payload: { compareUrl, runtime, sessionCount: job.sessions.length },
    });
  } finally {
    clearInterval(heartbeat);
  }
}

async function runWorkflowParallel(job) {
  const heartbeat = setInterval(() => void sendEvent(job.id, { kind: "worker.heartbeat", message: "running" }), 10000);
  try {
    const { repositoryDir, branch } = await prepareRepository(job);
    await sendEvent(job.id, {
      status: "running",
      activeSessionId: null,
      kind: "runtime.selected",
      message: `Parallel direct runtime selected for ${job.sessions.length} sessions`,
      workBranch: branch,
      payload: { runtime: "direct", mode: job.executionMode, executionStrategy: "parallel" },
    });

    const pendingSessions = job.sessions.filter((session) => session.status !== "done");
    const results = await Promise.all(pendingSessions.map(async (session) => {
      const { worktreePath, sessionBranch } = await prepareSessionWorktree(job, session, repositoryDir, branch);
      await markSession(job, session, "working", { runtime: "direct", runtimeName: `parallel:${session.id}` });
      const result = await runDirectSession(job, session, worktreePath, { parallel: true });
      return { session, sessionBranch, result };
    }));

    if (results.some((entry) => entry.result?.blocked)) return;

    for (const session of [...job.sessions].sort((left, right) => left.ordinal - right.ordinal)) {
      const entry = results.find((item) => item.session.id === session.id);
      if (entry) await mergeSessionBranch(repositoryDir, entry.sessionBranch, branch);
    }

    const finalSummary = results.map((entry) => `${entry.session.role}:\n${entry.result.summary || "Completed"}`).join("\n\n");
    const diffStats = results.map((entry) => `${entry.session.role}: ${entry.result.diffStat || "No file changes"}`);
    const push = await run("git", ["push", "--force-with-lease", "-u", "origin", branch], { cwd: repositoryDir });
    if (push.code !== 0) throw new Error(push.stderr || "Could not push isolated branch. Run 'gh auth setup-git' and retry.");
    const compareUrl = `https://github.com/${job.repository}/compare/${encodeURIComponent(job.baseBranch)}...${encodeURIComponent(branch)}?expand=1`;
    await sendEvent(job.id, {
      status: "review",
      activeSessionId: null,
      kind: "workflow.completed",
      message: `${job.sessions.length}-session parallel workflow complete; branch is ready for review`,
      summary: finalSummary || "All parallel agent sessions completed.",
      diffStat: diffStats.join("\n") || "No file changes",
      workBranch: branch,
      payload: { compareUrl, runtime: "direct", executionStrategy: "parallel", sessionCount: job.sessions.length },
    });
  } finally {
    clearInterval(heartbeat);
  }
}

async function publish(job) {
  const heartbeat = setInterval(() => void sendEvent(job.id, { kind: "worker.heartbeat", message: "publishing" }), 10000);
  try {
    const { repositoryDir, branch } = await prepareRepository(job);
    if (!(await has("gh"))) throw new Error("GitHub CLI is required to create a pull request.");
    let view = await run("gh", ["pr", "view", branch, "--json", "url", "--jq", ".url"], { cwd: repositoryDir });
    if (view.code !== 0 || !view.stdout.trim()) {
      const actors = job.sessions.map((session) => `${session.role}: ${session.actor}`).join("\n");
      const body = `Created by TeamWeave after human approval.\n\nTask: ${job.title}\nMode: ${job.executionMode}\nSessions:\n${actors}\nAttempt: ${job.attempt}`;
      view = await run("gh", ["pr", "create", "--base", job.baseBranch, "--head", branch, "--title", job.title, "--body", body], { cwd: repositoryDir });
    }
    if (view.code !== 0) throw new Error(view.stderr || "Could not create pull request");
    const prUrl = view.stdout.trim().split("\n").find((line) => line.startsWith("http")) || "";
    await sendEvent(job.id, { status: "done", activeSessionId: null, kind: "github.pr_created", message: "Pull request created after approval", prUrl, workBranch: branch });
  } finally {
    clearInterval(heartbeat);
  }
}

console.log(`TeamWeave worker ${hostname()} · ${platform()} ${arch()}`);
await mkdir(ROOT, { recursive: true });
let detectedActors = await detectCapabilities();
let detectedRuntimes = await detectRuntimes();
console.log(`Detected actors: ${detectedActors.join(", ") || "none"}`);
console.log(`Detected runtimes: ${detectedRuntimes.join(", ")}`);
if (!detectedActors.length) console.log("Install and authenticate Pi, Codex, or Claude Code, then restart.");

while (true) {
  try {
    detectedActors = await detectCapabilities();
    detectedRuntimes = await detectRuntimes();
    const response = await api("/api/worker/poll", {
      platform: `${hostname()} · ${platform()} ${arch()}`,
      capabilities: detectedActors,
      runtimes: detectedRuntimes,
    });
    if (!response.job) {
      await delay(response.pollAfterMs || 3500);
      continue;
    }
    const job = response.job;
    console.log(`[${job.id}] ${job.operation}: ${job.title} · ${job.sessions.length} session(s)`);
    try {
      if (job.operation === "publish") await publish(job);
      else await runWorkflow(job);
    } catch (error) {
      console.error(error);
      await sendEvent(job.id, {
        status: "failed",
        activeSessionId: null,
        kind: "worker.failed",
        message: "Worker could not complete the job",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } catch (error) {
    console.error("Poll failed:", error instanceof Error ? error.message : String(error));
    await delay(5000);
  }
}
