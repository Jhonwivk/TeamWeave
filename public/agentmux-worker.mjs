#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { homedir, platform, arch, hostname } from "node:os";
import { join, resolve } from "node:path";

const CONTROL_URL = (process.env.AGENTMUX_URL || "").replace(/\/$/, "");
const TOKEN = process.env.AGENTMUX_TOKEN || "";
const ROOT = resolve(process.env.AGENTMUX_WORKDIR || join(homedir(), ".agentmux", "workspaces"));
const HERDR_TIMEOUT = Number(process.env.AGENTMUX_HERDR_TIMEOUT || 30 * 60 * 1000);

// Keep this registry aligned with lib/actors.ts. Herdr resolves the actor kind
// itself; commandCandidates are used for worker capability detection and the
// direct CLI adapters below.
const ACTOR_REGISTRY = {
  pi: { commandCandidates: ["pi"], runtimes: ["herdr", "direct"] },
  codex: { commandCandidates: ["codex"], runtimes: ["herdr", "direct"] },
  claude: { commandCandidates: ["claude"], runtimes: ["herdr", "direct"] },
  gemini: { commandCandidates: ["gemini"], runtimes: ["herdr", "direct"] },
  cursor: { commandCandidates: ["agent", "cursor-agent", "cursor"], runtimes: ["herdr", "direct"] },
  copilot: { commandCandidates: ["copilot"], runtimes: ["herdr", "direct"] },
  opencode: { commandCandidates: ["opencode"], runtimes: ["herdr", "direct"] },
  qwen: { commandCandidates: ["qwen"], runtimes: ["herdr", "direct"] },
  aider: { commandCandidates: ["aider"], runtimes: ["direct"] },
  kimi: { commandCandidates: ["kimi"], runtimes: ["herdr"] },
  kiro: { commandCandidates: ["kiro-cli", "kiro"], runtimes: ["herdr"] },
  droid: { commandCandidates: ["droid"], runtimes: ["herdr"] },
  amp: { commandCandidates: ["amp"], runtimes: ["herdr"] },
  devin: { commandCandidates: ["devin"], runtimes: ["herdr"] },
  cline: { commandCandidates: ["cline"], runtimes: ["herdr"] },
  qodercli: { commandCandidates: ["qodercli", "qoder"], runtimes: ["herdr"] },
};
let detectedCommands = new Map();

if (!CONTROL_URL || !TOKEN) {
  console.error("Set AGENTMUX_URL and AGENTMUX_TOKEN before starting the worker.");
  process.exit(1);
}

const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const terminalProcesses = new Map();

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
  detectedCommands = new Map();
  const requested = new Set((process.env.AGENTMUX_ACTORS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  for (const [name, actor] of Object.entries(ACTOR_REGISTRY)) {
    if (requested.size && !requested.has(name)) continue;
    for (const command of actor.commandCandidates) {
      if (await has(command)) {
        names.push(name);
        detectedCommands.set(name, command);
        break;
      }
    }
  }
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

async function sendWorkspaceEvent(workspaceId, event) {
  try {
    await api("/api/worker/events", {
      workspaceId,
      ...event,
      workspace: { id: workspaceId, ...(event.workspace || {}) },
    });
  } catch (error) {
    console.error("Could not send workspace event:", error instanceof Error ? error.message : String(error));
  }
}

async function sendTerminalEvent(terminalId, event) {
  try {
    await api("/api/worker/terminal", { terminalId, ...event });
  } catch (error) {
    console.error("Could not send terminal event:", error instanceof Error ? error.message : String(error));
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
  const command = detectedCommands.get(session.actor) || ACTOR_REGISTRY[session.actor]?.commandCandidates[0];
  if (!command) throw new Error(`No executable was detected for ${session.actor}`);
  if (session.actor === "pi") {
    const args = ["--mode", "json", "--approve", "--no-session"];
    if (session.model) args.push("--model", String(session.model));
    return { command, args: [...args, prompt] };
  }
  if (session.actor === "codex") {
    const args = ["exec", "--json", "--sandbox", "workspace-write", "--ephemeral"];
    if (session.model) args.push("--model", String(session.model));
    return { command, args: [...args, prompt] };
  }
  if (session.actor === "claude") {
    const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"];
    if (session.model) args.push("--model", String(session.model));
    return { command, args: [...args, prompt] };
  }
  if (session.actor === "gemini") {
    const args = ["--prompt", prompt, "--output-format", "json", "--yolo"];
    if (session.model) args.push("--model", String(session.model));
    return { command, args };
  }
  if (session.actor === "cursor") {
    const args = ["-p", "--force", "--output-format", "json"];
    if (session.model) args.push("--model", String(session.model));
    return { command, args: [...args, prompt] };
  }
  if (session.actor === "copilot") {
    const args = ["-p", prompt, "-s", "--no-ask-user", "--allow-tool", "shell(*), write"];
    if (session.model) args.push("--model", String(session.model));
    return { command, args };
  }
  if (session.actor === "opencode") {
    const args = ["run", "--auto", "--format", "json"];
    if (session.model) args.push("--model", String(session.model));
    return { command, args: [...args, prompt] };
  }
  if (session.actor === "qwen") {
    const args = ["--prompt", prompt, "--output-format", "json", "--yolo"];
    if (session.model) args.push("--model", String(session.model));
    return { command, args };
  }
  if (session.actor === "aider") {
    const args = ["--message", prompt, "--yes", "--no-auto-commits", "--no-dirty-commits"];
    if (session.model) args.push("--model", String(session.model));
    return { command, args };
  }
  throw new Error(`${session.actor} is supported through Herdr; no direct CLI adapter is configured`);
}

function actorSupportsRuntime(actor, runtime) {
  return !!ACTOR_REGISTRY[actor]?.runtimes.includes(runtime);
}

function selectRuntime(job, session, installedRuntimes) {
  if (job.runtime === "herdr") {
    if (!installedRuntimes.includes("herdr") || !actorSupportsRuntime(session.actor, "herdr")) {
      throw new Error(`${session.actor} requires a Herdr runtime on this worker`);
    }
    return "herdr";
  }
  if (job.runtime === "direct") {
    if (!installedRuntimes.includes("direct") || !actorSupportsRuntime(session.actor, "direct")) {
      throw new Error(`${session.actor} does not have a direct CLI adapter; choose Auto or Herdr`);
    }
    return "direct";
  }
  if (installedRuntimes.includes("herdr") && actorSupportsRuntime(session.actor, "herdr")) return "herdr";
  if (installedRuntimes.includes("direct") && actorSupportsRuntime(session.actor, "direct")) return "direct";
  throw new Error(`${session.actor} is not available on this worker`);
}

function herdrModelArgs(session) {
  if (!session.model) return [];
  if (session.actor === "codex") return ["--", "-m", String(session.model)];
  return ["--", "--model", String(session.model)];
}

function promptFor(job, session, incoming) {
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
    "",
    job.prompt,
    ...prior,
    "",
    "Work only inside this repository and current branch. Inspect upstream changes before editing.",
    "Make the smallest coherent change and run relevant checks.",
    "Do not push, merge, create a pull request, or alter git remotes. TeamWeave owns Git delivery.",
    "At the end, give a concise handoff: decisions, changed files, checks, risks, and what the next agent should do.",
  ].join("\n");
}

async function prepareRepository(job) {
  if (job.workspace) return prepareWorkspace(job.workspace);
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

function workspaceDirectory(workspace) {
  const fallback = join(ROOT, String(workspace.id));
  if (!workspace.localPath) return fallback;
  const candidate = resolve(String(workspace.localPath));
  return candidate === ROOT || candidate.startsWith(`${ROOT}/`) ? candidate : fallback;
}

async function prepareWorkspace(workspace) {
  await mkdir(ROOT, { recursive: true });
  const repositoryDir = workspaceDirectory(workspace);
  const gitDir = join(repositoryDir, ".git");
  if (!(await exists(gitDir))) {
    if (await exists(repositoryDir)) {
      throw new Error(`Workspace path exists but is not a Git checkout: ${repositoryDir}`);
    }
    console.log(`Cloning ${workspace.repository} for workspace ${workspace.id}...`);
    const ghReady = await has("gh");
    const result = ghReady
      ? await run("gh", ["repo", "clone", workspace.repository, repositoryDir, "--", "--filter=blob:none"])
      : await run("git", ["clone", "--filter=blob:none", workspace.repositoryUrl, repositoryDir]);
    if (result.code !== 0) throw new Error(result.stderr || "Repository clone failed");
  }

  const fetched = await run("git", ["fetch", "origin", "--prune"], { cwd: repositoryDir });
  if (fetched.code !== 0) throw new Error(fetched.stderr || "Could not fetch repository updates");
  const branch = workspace.workingBranch || `teamweave/workspace-${String(workspace.id).replace("ws_", "").slice(0, 12)}`;
  const current = await run("git", ["branch", "--show-current"], { cwd: repositoryDir });
  if (current.stdout.trim() !== branch) {
    const dirty = await run("git", ["status", "--porcelain"], { cwd: repositoryDir });
    if (dirty.stdout.trim()) throw new Error(`Workspace has uncommitted changes on ${current.stdout.trim() || "detached HEAD"}; clean it manually before reopening.`);
    const remoteBranch = await run("git", ["rev-parse", "--verify", `origin/${branch}`], { cwd: repositoryDir });
    const startPoint = remoteBranch.code === 0 ? `origin/${branch}` : `origin/${workspace.baseBranch}`;
    const checkout = await run("git", ["checkout", "-B", branch, startPoint], { cwd: repositoryDir });
    if (checkout.code !== 0) throw new Error(checkout.stderr || "Could not create workspace branch");
  }
  await run("git", ["config", "user.name", "TeamWeave Worker"], { cwd: repositoryDir });
  await run("git", ["config", "user.email", "teamweave-worker@users.noreply.github.com"], { cwd: repositoryDir });
  return { repositoryDir, branch };
}

function terminalShell(shell) {
  if (process.platform === "win32") {
    if (shell === "cmd") return { command: "cmd.exe", args: [] };
    return { command: shell === "pwsh" ? "pwsh.exe" : "powershell.exe", args: ["-NoLogo", "-NoProfile"] };
  }
  const command = ["bash", "zsh", "sh"].includes(shell) ? shell : (process.env.SHELL || "/bin/bash");
  return { command, args: ["-il"] };
}

async function terminalSpawnSpec(shell) {
  const base = terminalShell(shell);
  const scriptPath = process.platform !== "win32" && (await exists("/usr/bin/script") || await exists("/bin/script"))
    ? (await exists("/usr/bin/script") ? "/usr/bin/script" : "/bin/script")
    : null;
  if (scriptPath && process.platform === "linux") {
    return {
      command: scriptPath,
      args: ["-qefc", `exec ${base.command} ${base.args.join(" ")}`, "/dev/null"],
      shell: base.command,
      pty: true,
    };
  }
  if (scriptPath && process.platform === "darwin") {
    return { command: scriptPath, args: ["-q", "/dev/null", base.command, ...base.args], shell: base.command, pty: true };
  }
  return { command: base.command, args: base.args, shell: base.command, pty: false };
}

function terminalEnvironment() {
  const childEnv = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" };
  delete childEnv.AGENTMUX_TOKEN;
  delete childEnv.AGENTMUX_SITE_TOKEN;
  delete childEnv.GH_TOKEN;
  delete childEnv.GITHUB_TOKEN;
  return childEnv;
}

async function startTerminalProcess(job) {
  const terminal = job.terminal;
  const workspace = job.workspace;
  const existing = terminalProcesses.get(String(terminal.id));
  if (existing) return existing;
  const cwd = workspaceDirectory({ id: workspace.id, localPath: workspace.localPath });
  if (!(await exists(cwd))) throw new Error(`Workspace directory is not available: ${cwd}`);
  const shell = await terminalSpawnSpec(String(terminal.shell || "bash"));
  const child = spawn(shell.command, shell.args, {
    cwd,
    env: terminalEnvironment(),
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });
  const state = { child, stopping: false, cwd, shell: shell.shell, pty: shell.pty };
  terminalProcesses.set(String(terminal.id), state);
  child.stdout?.on("data", (chunk) => void sendTerminalEvent(String(terminal.id), {
    kind: "terminal.output",
    data: chunk.toString(),
    payload: { stream: "stdout" },
  }));
  child.stderr?.on("data", (chunk) => void sendTerminalEvent(String(terminal.id), {
    kind: "terminal.output",
    data: chunk.toString(),
    payload: { stream: "stderr" },
  }));
  child.on("error", (error) => {
    if (terminalProcesses.get(String(terminal.id)) === state) terminalProcesses.delete(String(terminal.id));
    void sendTerminalEvent(String(terminal.id), {
      kind: "terminal.failed",
      data: error instanceof Error ? error.message : String(error),
      terminal: { status: "failed", pid: null, error: error instanceof Error ? error.message : String(error) },
    });
  });
  child.on("close", (code) => {
    if (terminalProcesses.get(String(terminal.id)) === state) terminalProcesses.delete(String(terminal.id));
    const status = state.stopping ? "stopped" : "exited";
    void sendTerminalEvent(String(terminal.id), {
      kind: state.stopping ? "terminal.stopped" : "terminal.exited",
      data: `Shell exited with code ${code ?? 0}`,
      terminal: { status, pid: null, exitCode: code ?? 0 },
    });
  });
  await sendTerminalEvent(String(terminal.id), {
    kind: "terminal.started",
    data: `Connected to ${shell.command} in ${cwd}\n`,
    payload: { shell: shell.shell, cwd, pid: child.pid, pty: shell.pty },
    terminal: { status: "running", pid: child.pid ?? null, shell: shell.shell, cwd },
  });
  return state;
}

async function runTerminalJob(job) {
  const terminalId = String(job.terminal?.id || "");
  const commandId = String(job.command?.id || "");
  const action = String(job.command?.kind || "");
  if (!terminalId || !commandId) throw new Error("Terminal job is missing terminal or command metadata");
  try {
    if (action === "start") {
      await startTerminalProcess(job);
    } else if (action === "input") {
      const state = await startTerminalProcess(job);
      const data = typeof job.command?.payload?.data === "string" ? job.command.payload.data : "";
      if (state.child.stdin && !state.child.stdin.write(data)) await new Promise((resolveWrite) => state.child.stdin.once("drain", resolveWrite));
      await sendTerminalEvent(terminalId, { kind: "terminal.input", data, payload: { commandId }, terminal: { status: "running" } });
    } else if (action === "resize") {
      const cols = Number(job.command?.payload?.cols || 120);
      const rows = Number(job.command?.payload?.rows || 32);
      await sendTerminalEvent(terminalId, { kind: "terminal.resized", data: `Terminal size ${cols}×${rows}`, payload: { commandId, cols, rows }, terminal: { status: "running", cols, rows } });
    } else if (action === "stop") {
      const state = terminalProcesses.get(terminalId);
      if (state) {
        state.stopping = true;
        state.child.kill("SIGTERM");
        setTimeout(() => {
          if (terminalProcesses.get(terminalId) === state) state.child.kill("SIGKILL");
        }, 1500);
      }
      await sendTerminalEvent(terminalId, { kind: "terminal.stopped", data: "Terminal stopped by operator", payload: { commandId }, terminal: { status: "stopped", pid: null } });
    } else {
      throw new Error(`Unsupported terminal command: ${action}`);
    }
    await sendTerminalEvent(terminalId, { kind: "terminal.command_done", payload: { commandId, action }, terminal: { status: action === "stop" ? "stopped" : "running" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sendTerminalEvent(terminalId, { kind: "terminal.command_failed", data: message, payload: { commandId, action }, terminal: { status: "failed", error: message } });
    throw error;
  }
}

async function runWorkspaceJob(job) {
  const workspace = job.workspace;
  if (!workspace?.id) throw new Error("Workspace job did not include workspace metadata");
  await sendWorkspaceEvent(workspace.id, {
    kind: "workspace.preparing",
    message: `Preparing ${workspace.repository} on a dedicated branch`,
    workspace: { status: "preparing", error: null },
  });
  try {
    const prepared = await prepareWorkspace(workspace);
    await sendWorkspaceEvent(workspace.id, {
      kind: "workspace.ready",
      message: "Workspace is ready for agents and future terminal sessions",
      workspace: { status: "ready", localPath: prepared.repositoryDir, workingBranch: prepared.branch, error: null },
      payload: { repository: workspace.repository, baseBranch: workspace.baseBranch, workingBranch: prepared.branch },
    });
  } catch (error) {
    await sendWorkspaceEvent(workspace.id, {
      kind: "workspace.failed",
      message: "Worker could not prepare the workspace",
      workspace: { status: "failed", error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
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

async function runDirectSession(job, session, repositoryDir) {
  const incoming = await incomingMessages(job, session);
  const prompt = promptFor(job, session, incoming);
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
  const heartbeat = setInterval(() => void sendEvent(job.id, { kind: "worker.heartbeat", message: "running" }), 10000);
  try {
    const { repositoryDir, branch } = await prepareRepository(job);
    const installedRuntimes = await detectRuntimes();
    const pendingSessions = job.sessions.filter((session) => session.status !== "done");
    const plannedRuntimes = pendingSessions.map((session) => selectRuntime(job, session, installedRuntimes));
    const plannedRuntimeSet = [...new Set(plannedRuntimes)];
    const plannedRuntime = plannedRuntimeSet.length === 1 ? plannedRuntimeSet[0] : "mixed";
    await sendEvent(job.id, {
      status: "running",
      activeSessionId: job.activeSessionId || job.sessions.find((session) => session.status !== "done")?.id || null,
      kind: "runtime.selected",
      message: `${plannedRuntime === "mixed" ? "Mixed actor runtimes" : plannedRuntime === "herdr" ? "Herdr persistent runtime" : "Direct CLI"} selected per actor for ${job.sessions.length} session${job.sessions.length === 1 ? "" : "s"}`,
      workBranch: branch,
      payload: { runtime: plannedRuntime, runtimes: plannedRuntimeSet, mode: job.executionMode },
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
    const runtimesUsed = new Set();

    for (let index = 0; index < job.sessions.length; index += 1) {
      const session = job.sessions[index];
      if (session.status === "done") {
        finalSummary = session.summary || finalSummary;
        continue;
      }
      let result;
      let sessionRuntime = selectRuntime(job, session, installedRuntimes);
      try {
        result = sessionRuntime === "herdr"
          ? await runHerdrSession(job, session, repositoryDir, workspaceState)
          : await runDirectSession(job, session, repositoryDir);
      } catch (error) {
        if (sessionRuntime === "herdr" && job.runtime === "auto" && actorSupportsRuntime(session.actor, "direct") && installedRuntimes.includes("direct") && session.status !== "blocked") {
          await sendEvent(job.id, {
            kind: "runtime.fallback",
            message: `Herdr was unavailable; continuing ${session.role} with direct CLI`,
            payload: { reason: error instanceof Error ? error.message : String(error) },
          });
          sessionRuntime = "direct";
          session.status = "pending";
          result = await runDirectSession(job, session, repositoryDir);
        } else {
          throw error;
        }
      }
      if (result.blocked) return;
      runtimesUsed.add(sessionRuntime);
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
      payload: { compareUrl, runtime: runtimesUsed.size === 1 ? [...runtimesUsed][0] : "mixed", runtimes: [...runtimesUsed], sessionCount: job.sessions.length },
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
if (!detectedActors.length) console.log("Install and authenticate a supported coding agent, then restart.");

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
    console.log(`[${job.id}] ${job.operation}: ${job.title || job.workspace?.repository || "workspace"}${job.sessions ? ` · ${job.sessions.length} session(s)` : ""}`);
    try {
      if (job.operation === "workspace") await runWorkspaceJob(job);
      else if (job.operation === "terminal") await runTerminalJob(job);
      else if (job.operation === "publish") await publish(job);
      else await runWorkflow(job);
    } catch (error) {
      console.error(error);
      if (job.operation === "workspace" && job.workspace?.id) {
        await sendWorkspaceEvent(job.workspace.id, {
          kind: "workspace.failed",
          message: "Worker could not complete the workspace job",
          workspace: { status: "failed", error: error instanceof Error ? error.message : String(error) },
        });
      } else if (job.operation === "terminal" && job.terminal?.id) {
        await sendTerminalEvent(job.terminal.id, {
          kind: "terminal.failed",
          data: error instanceof Error ? error.message : String(error),
          terminal: { status: "failed", error: error instanceof Error ? error.message : String(error) },
        });
      } else {
        await sendEvent(job.id, {
          status: "failed",
          activeSessionId: null,
          kind: "worker.failed",
          message: "Worker could not complete the job",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    console.error("Poll failed:", error instanceof Error ? error.message : String(error));
    await delay(5000);
  }
}
