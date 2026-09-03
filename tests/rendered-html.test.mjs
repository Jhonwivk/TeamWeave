import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships GitHub auth, parallel execution, and expanded actor registry", async () => {
  const [consoleSource, workerSource, schemaSource, pollSource, authSource, tasksSource, actorsSource, migration] = await Promise.all([
    readFile(new URL("../app/console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/agentmux-worker.mjs", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/worker/poll/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/actors.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_parallel_execution.sql", import.meta.url), "utf8"),
  ]);

  assert.match(consoleSource, /TeamWeave/);
  assert.match(consoleSource, /executionStrategy/);
  assert.match(consoleSource, /Parallel/);
  assert.match(workerSource, /runWorkflowParallel/);
  assert.match(workerSource, /prepareSessionWorktree/);
  assert.match(workerSource, /runActorProcess/);
  assert.match(workerSource, /teamweave-sandbox: blocked git/);
  assert.match(workerSource, /AGENTMUX_GITHUB_TOKEN/);
  assert.match(workerSource, /AGENTMUX_ALLOW_HERDR/);
  assert.match(workerSource, /scrubActorEnv/);
  assert.match(schemaSource, /executionStrategy/);
  assert.match(pollSource, /executionStrategy/);
  assert.match(authSource, /exchangeGitHubCode/);
  assert.match(tasksSource, /isSupportedActor/);
  assert.match(actorsSource, /"cursor"/);
  assert.match(actorsSource, /"aider"/);
  assert.match(actorsSource, /"deepseek"/);
  assert.match(workerSource, /"headless"/);
  assert.match(migration, /execution_strategy/);
});

test("ships the TeamWeave console, Herdr runtime, and cross-session protocol", async () => {
  const [consoleSource, workerSource, schemaSource, pollSource, migration] = await Promise.all([
    readFile(new URL("../app/console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/agentmux-worker.mjs", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/worker/poll/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_sloppy_roulette.sql", import.meta.url), "utf8"),
  ]);

  assert.match(consoleSource, /Single agent/);
  assert.match(consoleSource, /Agent workflow/);
  assert.match(consoleSource, /Cross-session messages/);
  assert.match(workerSource, /herdrAgentName/);
  assert.match(workerSource, /"agent", "prompt"/);
  assert.match(workerSource, /session\.handoff/);
  assert.match(workerSource, /workspace-write/);
  assert.match(workerSource, /"pr", "create"/);
  assert.match(schemaSource, /agentSessions/);
  assert.match(schemaSource, /sessionMessages/);
  assert.match(pollSource, /resume_requested/);
  assert.match(migration, /CREATE TABLE `agent_sessions`/);
  assert.match(migration, /CREATE TABLE `session_messages`/);
});
