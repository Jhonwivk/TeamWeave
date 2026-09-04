import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the TeamWeave console, Herdr runtime, and cross-session protocol", async () => {
  const [consoleSource, workerSource, actorSource, schemaSource, pollSource, workspaceRoute, terminalRoute, workerTerminalRoute, processesRoute, migration, workspaceMigration, terminalMigration, processesMigration, filesMigration] = await Promise.all([
    readFile(new URL("../app/console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/agentmux-worker.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/actors.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/worker/poll/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspaces/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspaces/[id]/terminal/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/worker/terminal/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/worker/processes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_sloppy_roulette.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_woozy_night_thrasher.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_married_mysterio.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_open_jazinda.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_clear_the_hood.sql", import.meta.url), "utf8"),
  ]);

  assert.match(consoleSource, /TeamWeave/);
  assert.match(consoleSource, /Single agent/);
  assert.match(consoleSource, /Agent workflow/);
  assert.match(consoleSource, /Cross-session messages/);
  assert.match(consoleSource, /Development workspaces/);
  assert.match(consoleSource, /Open workspace/);
  assert.match(consoleSource, /Workspace terminal/);
  assert.match(consoleSource, /WorkspaceShell/);
  assert.match(consoleSource, /ProductSidebar/);
  assert.match(consoleSource, /NextActionPanel/);
  assert.match(consoleSource, /Worker fleet/);
  assert.match(consoleSource, /Overview/);
  assert.match(consoleSource, /Collaboration/);
  assert.match(consoleSource, /Agent Runs/);
  assert.match(consoleSource, /Processes & ports/);
  assert.match(consoleSource, /WorkspacePreview/);
  assert.match(consoleSource, /WorkspaceFiles/);
  assert.match(consoleSource, /No matching files/);
  assert.match(consoleSource, /read-only index/);
  assert.match(consoleSource, /No listening ports detected/);
  assert.match(consoleSource, /iframe/);
  assert.match(consoleSource, /localhost:\$\{primaryPort\.port\}/);
  assert.match(consoleSource, /Preview runs on the connected worker machine/);
  assert.match(consoleSource, /Start agent task/);
  assert.match(actorSource, /name: "Gemini CLI"/);
  assert.match(actorSource, /name: "GitHub Copilot"/);
  assert.match(actorSource, /id: "opencode"/);
  assert.match(actorSource, /id: "aider"/);
  assert.match(actorSource, /id: "qodercli"/);
  assert.match(workerSource, /ACTOR_REGISTRY/);
  assert.match(workerSource, /session.actor === "gemini"/);
  assert.match(workerSource, /session.actor === "aider"/);
  assert.match(workerSource, /selectRuntime/);
  assert.match(workerSource, /herdrAgentName/);
  assert.match(workerSource, /"agent", "prompt"/);
  assert.match(workerSource, /session\.handoff/);
  assert.match(workerSource, /workspace-write/);
  assert.match(workerSource, /"pr", "create"/);
  assert.match(schemaSource, /agentSessions/);
  assert.match(schemaSource, /sessionMessages/);
  assert.match(pollSource, /resume_requested/);
  assert.match(pollSource, /hydrateWorkspace/);
  assert.match(workerSource, /runWorkspaceJob/);
  assert.match(workerSource, /prepareWorkspace/);
  assert.match(workerSource, /workspace\.ready/);
  assert.match(workerSource, /monitorWorkspaceRuntime/);
  assert.match(workerSource, /discoverUnixPorts/);
  assert.match(workerSource, /discoverWorkspaceFiles/);
  assert.match(workerSource, /ignoredWorkspacePath/);
  assert.match(workerSource, /FILE_INDEX_INTERVAL/);
  assert.match(workerSource, /redactCommand/);
  assert.match(workerSource, /runTerminalJob/);
  assert.match(workerSource, /terminal\.output/);
  assert.match(workspaceRoute, /development_workspaces/);
  assert.match(workspaceRoute, /Workspace queued for a local worker/);
  assert.match(terminalRoute, /workspace_terminal_commands/);
  assert.match(workerTerminalRoute, /workspace_terminal_events/);
  assert.match(processesRoute, /workspace_processes/);
  assert.match(processesRoute, /workspace_ports/);
  assert.match(processesRoute, /workspace_files/);
  assert.match(processesRoute, /safeRelativePath/);
  assert.match(processesRoute, /isInsideWorkspace/);
  assert.match(migration, /CREATE TABLE `agent_sessions`/);
  assert.match(migration, /CREATE TABLE `session_messages`/);
  assert.match(workspaceMigration, /CREATE TABLE `development_workspaces`/);
  assert.match(workspaceMigration, /ALTER TABLE `tasks` ADD `workspace_id`/);
  assert.match(terminalMigration, /CREATE TABLE `workspace_terminals`/);
  assert.match(terminalMigration, /CREATE TABLE `workspace_terminal_commands`/);
  assert.match(terminalMigration, /CREATE TABLE `workspace_terminal_events`/);
  assert.match(processesMigration, /CREATE TABLE `workspace_processes`/);
  assert.match(processesMigration, /CREATE TABLE `workspace_ports`/);
  assert.match(filesMigration, /CREATE TABLE `workspace_files`/);
});
