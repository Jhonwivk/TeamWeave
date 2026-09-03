/**
 * Product-level registry for coding Agent actors.
 *
 * The worker keeps a small executable registry as well because the worker is
 * downloaded as a standalone .mjs file. Keep the ids and runtime matrix in
 * sync with public/agentmux-worker.mjs.
 */
export const ACTOR_CATALOG = [
  {
    id: "pi",
    name: "Pi",
    runtimes: ["herdr", "direct"],
    detail: "Minimal coding harness · JSON mode",
    modelHint: "provider/model",
    tier: "core",
  },
  {
    id: "codex",
    name: "Codex",
    runtimes: ["herdr", "direct"],
    detail: "OpenAI coding agent · workspace sandbox",
    modelHint: "Use CLI default",
    tier: "core",
  },
  {
    id: "claude",
    name: "Claude Code",
    runtimes: ["herdr", "direct"],
    detail: "Anthropic coding agent · headless edits",
    modelHint: "sonnet",
    tier: "core",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    runtimes: ["herdr", "direct"],
    detail: "Google coding agent · headless JSON",
    modelHint: "gemini model",
    tier: "common",
  },
  {
    id: "cursor",
    name: "Cursor Agent",
    runtimes: ["herdr", "direct"],
    detail: "Cursor terminal agent · print mode",
    modelHint: "Use CLI default",
    tier: "common",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    runtimes: ["herdr", "direct"],
    detail: "GitHub coding agent · programmatic prompt",
    modelHint: "Use CLI default",
    tier: "common",
  },
  {
    id: "opencode",
    name: "OpenCode",
    runtimes: ["herdr", "direct"],
    detail: "Open-source coding agent · JSON events",
    modelHint: "provider/model",
    tier: "common",
  },
  {
    id: "qwen",
    name: "Qwen Code",
    runtimes: ["herdr", "direct"],
    detail: "Alibaba coding agent · headless mode",
    modelHint: "Use CLI default",
    tier: "common",
  },
  {
    id: "aider",
    name: "Aider",
    runtimes: ["direct"],
    detail: "Terminal pair programmer · one-shot message",
    modelHint: "provider/model",
    tier: "common",
  },
  {
    id: "kimi",
    name: "Kimi Code",
    runtimes: ["herdr"],
    detail: "Kimi coding agent · Herdr session",
    modelHint: "Use CLI default",
    tier: "extended",
  },
  {
    id: "kiro",
    name: "Kiro CLI",
    runtimes: ["herdr"],
    detail: "AWS Kiro agent · Herdr session",
    modelHint: "Use CLI default",
    tier: "extended",
  },
  {
    id: "droid",
    name: "Factory Droid",
    runtimes: ["herdr"],
    detail: "Factory coding agent · Herdr session",
    modelHint: "Use CLI default",
    tier: "extended",
  },
  {
    id: "amp",
    name: "Amp",
    runtimes: ["herdr"],
    detail: "Sourcegraph Amp · Herdr session",
    modelHint: "Use CLI default",
    tier: "extended",
  },
  {
    id: "devin",
    name: "Devin CLI",
    runtimes: ["herdr"],
    detail: "Devin terminal agent · Herdr session",
    modelHint: "Use CLI default",
    tier: "extended",
  },
  {
    id: "cline",
    name: "Cline",
    runtimes: ["herdr"],
    detail: "Cline coding agent · Herdr session",
    modelHint: "Use CLI default",
    tier: "extended",
  },
  {
    id: "qodercli",
    name: "Qoder CLI",
    runtimes: ["herdr"],
    detail: "Qoder coding agent · Herdr session",
    modelHint: "Use CLI default",
    tier: "extended",
  },
] as const;

export type ActorId = (typeof ACTOR_CATALOG)[number]["id"];
export type ActorRuntime = "herdr" | "direct";

export const ACTOR_IDS = ACTOR_CATALOG.map((actor) => actor.id) as ActorId[];
export const DIRECT_ACTOR_IDS = ACTOR_CATALOG.filter((actor) => (actor.runtimes as readonly string[]).includes("direct")).map((actor) => actor.id) as ActorId[];
export const HERDR_ACTOR_IDS = ACTOR_CATALOG.filter((actor) => (actor.runtimes as readonly string[]).includes("herdr")).map((actor) => actor.id) as ActorId[];

export function getActor(actorId: string) {
  return ACTOR_CATALOG.find((actor) => actor.id === actorId);
}

export function actorSupportsRuntime(actorId: string, runtime: ActorRuntime) {
  const actor = getActor(actorId);
  return !!actor && (actor.runtimes as readonly string[]).includes(runtime);
}
