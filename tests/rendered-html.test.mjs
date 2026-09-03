import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the TeamWeave console, Herdr runtime, and cross-session protocol", async () => {
  const [consoleSource, workerSource, actorSource, schemaSource, pollSource, workspaceRoute, migration, workspaceMigration] = await Promise.all([
    readFile(new URL("../app/console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/agentmux-worker.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/actors.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/worker/poll/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspaces/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_sloppy_roulette.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_woozy_night_thrasher.sql", import.meta.url), "utf8"),
  ]);

  assert.match(consoleSource, /TeamWeave/);
  assert.match(consoleSource, /Single agent/);
  assert.match(consoleSource, /Agent workflow/);
  assert.match(consoleSource, /Cross-session messages/);
  assert.match(consoleSource, /Development workspaces/);
  assert.match(consoleSource, /Open workspace/);
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
  assert.match(workspaceRoute, /development_workspaces/);
  assert.match(workspaceRoute, /Workspace queued for a local worker/);
  assert.match(migration, /CREATE TABLE `agent_sessions`/);
  assert.match(migration, /CREATE TABLE `session_messages`/);
  assert.match(workspaceMigration, /CREATE TABLE `development_workspaces`/);
  assert.match(workspaceMigration, /ALTER TABLE `tasks` ADD `workspace_id`/);
});
