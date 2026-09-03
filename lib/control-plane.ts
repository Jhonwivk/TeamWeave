import { env } from "cloudflare:workers";

type RuntimeEnv = { DB: D1Database };

export function database() {
  const db = (env as unknown as RuntimeEnv).DB;
  if (!db) throw new Error("Database binding is unavailable");
  return db;
}

export function ownerIdFrom(request: Request) {
  // Sites normally injects the stable user id. Some authenticated Site entry
  // points only forward the verified email header, though, so keep the API
  // usable there without weakening the trust boundary to client-supplied data.
  const userId = request.headers.get("oai-authenticated-user-id")?.trim();
  if (userId) return userId;
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  return email ? `email:${email}` : null;
}

export function requireOwner(request: Request) {
  const ownerId = ownerIdFrom(request);
  if (!ownerId) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) } as const;
  return { ownerId } as const;
}

export async function tokenHash(token: string) {
  const bytes = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function requireWorker(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { error: Response.json({ error: "Worker token required" }, { status: 401 }) } as const;
  const hash = await tokenHash(token);
  const worker = await database().prepare(
    "SELECT id, owner_id AS ownerId, name FROM workers WHERE token_hash = ?"
  ).bind(hash).first<{ id: string; ownerId: string; name: string }>();
  if (!worker) return { error: Response.json({ error: "Invalid worker token" }, { status: 401 }) } as const;
  return { worker } as const;
}

export function jsonBody<T>(request: Request) {
  return request.json() as Promise<T>;
}

export function cleanString(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function now() {
  return Date.now();
}

export function taskId() {
  return `task_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function repoId() {
  return `repo_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function workerId() {
  return `worker_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function workspaceId() {
  return `ws_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function terminalId() {
  return `term_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function terminalCommandId() {
  return `termcmd_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function sessionId() {
  return `sess_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function messageId() {
  return `msg_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
