export const ACTOR_IDS = [
  "pi",
  "codex",
  "claude",
  "cursor",
  "aider",
  "gemini",
  "opencode",
  "goose",
  "amazon_q",
  "windsurf",
  "copilot",
] as const;

export type ActorId = (typeof ACTOR_IDS)[number];

export type ActorDefinition = {
  id: ActorId;
  name: string;
  detail: string;
  cli: string;
  herdrKind: string;
  tone: "violet" | "cyan" | "amber" | "emerald" | "rose" | "sky";
};

export const ACTOR_REGISTRY: Record<ActorId, ActorDefinition> = {
  pi: {
    id: "pi",
    name: "Pi",
    detail: "Minimal coding harness · JSON mode",
    cli: "pi",
    herdrKind: "pi",
    tone: "violet",
  },
  codex: {
    id: "codex",
    name: "Codex",
    detail: "Workspace-write sandbox · JSONL",
    cli: "codex",
    herdrKind: "codex",
    tone: "cyan",
  },
  claude: {
    id: "claude",
    name: "Claude Code",
    detail: "Headless stream · accept edits",
    cli: "claude",
    herdrKind: "claude",
    tone: "amber",
  },
  cursor: {
    id: "cursor",
    name: "Cursor Agent",
    detail: "Cursor CLI agent mode",
    cli: "cursor",
    herdrKind: "cursor",
    tone: "violet",
  },
  aider: {
    id: "aider",
    name: "Aider",
    detail: "Pair-programming CLI · auto-commit",
    cli: "aider",
    herdrKind: "aider",
    tone: "emerald",
  },
  gemini: {
    id: "gemini",
    name: "Gemini CLI",
    detail: "Google Gemini command-line agent",
    cli: "gemini",
    herdrKind: "gemini",
    tone: "sky",
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    detail: "Open-source terminal coding agent",
    cli: "opencode",
    herdrKind: "opencode",
    tone: "cyan",
  },
  goose: {
    id: "goose",
    name: "Goose",
    detail: "Block AI agent · autonomous edits",
    cli: "goose",
    herdrKind: "goose",
    tone: "amber",
  },
  amazon_q: {
    id: "amazon_q",
    name: "Amazon Q",
    detail: "AWS Q Developer CLI",
    cli: "q",
    herdrKind: "amazon_q",
    tone: "rose",
  },
  windsurf: {
    id: "windsurf",
    name: "Windsurf",
    detail: "Codeium Windsurf cascade CLI",
    cli: "windsurf",
    herdrKind: "windsurf",
    tone: "emerald",
  },
  copilot: {
    id: "copilot",
    name: "GitHub Copilot",
    detail: "Copilot CLI · gh extension",
    cli: "copilot",
    herdrKind: "copilot",
    tone: "sky",
  },
};

export const SUPPORTED_ACTORS = ACTOR_IDS;

export function isSupportedActor(value: string): value is ActorId {
  return (ACTOR_IDS as readonly string[]).includes(value);
}

export function actorCli(value: string): string {
  if (isSupportedActor(value)) return ACTOR_REGISTRY[value].cli;
  return value;
}
