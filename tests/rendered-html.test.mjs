import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the TeamWeave console, Herdr runtime, and cross-session protocol", async () => {
  const [consoleSource, workerSource, schemaSource, pollSource, migration] = await Promise.all([
    readFile(new URL("../app/console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/agentmux-worker.mjs", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/worker/poll/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_sloppy_roulette.sql", import.meta.url), "utf8"),
  ]);

  assert.match(consoleSource, /TeamWeave/);
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
