import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const repositories = sqliteTable("repositories", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  fullName: text("full_name").notNull(),
  url: text("url").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  visibility: text("visibility").notNull().default("unknown"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_repositories_owner_full_name").on(table.ownerId, table.fullName),
  index("idx_repositories_owner").on(table.ownerId),
]);

export const workers = sqliteTable("workers", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  platform: text("platform").notNull().default("unknown"),
  capabilities: text("capabilities").notNull().default("[]"),
  runtimes: text("runtimes").notNull().default('["direct"]'),
  lastSeenAt: integer("last_seen_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_workers_token_hash").on(table.tokenHash),
  index("idx_workers_owner_last_seen").on(table.ownerId, table.lastSeenAt),
]);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  repositoryId: text("repository_id").notNull().references(() => repositories.id),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  actor: text("actor").notNull(),
  model: text("model"),
  mode: text("mode").notNull().default("single"),
  runtime: text("runtime").notNull().default("auto"),
  activeSessionId: text("active_session_id"),
  baseBranch: text("base_branch").notNull().default("main"),
  workBranch: text("work_branch"),
  status: text("status").notNull().default("queued"),
  workerId: text("worker_id").references(() => workers.id),
  attempt: integer("attempt").notNull().default(1),
  summary: text("summary"),
  diffStat: text("diff_stat"),
  prUrl: text("pr_url"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("idx_tasks_owner_status_updated").on(table.ownerId, table.status, table.updatedAt),
  index("idx_tasks_worker_status").on(table.workerId, table.status),
]);

export const taskEvents = sqliteTable("task_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: text("task_id").notNull().references(() => tasks.id),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  payload: text("payload"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_task_events_task_created").on(table.taskId, table.createdAt),
]);

export const agentSessions = sqliteTable("agent_sessions", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  actor: text("actor").notNull(),
  role: text("role").notNull(),
  model: text("model"),
  ordinal: integer("ordinal").notNull(),
  status: text("status").notNull().default("pending"),
  runtime: text("runtime"),
  runtimeName: text("runtime_name"),
  workspaceId: text("workspace_id"),
  paneId: text("pane_id"),
  summary: text("summary"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_agent_sessions_task_ordinal").on(table.taskId, table.ordinal),
  index("idx_agent_sessions_task_status").on(table.taskId, table.status),
  index("idx_agent_sessions_runtime_name").on(table.runtimeName),
]);

export const sessionMessages = sqliteTable("session_messages", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  fromSessionId: text("from_session_id").references(() => agentSessions.id),
  toSessionId: text("to_session_id").references(() => agentSessions.id),
  kind: text("kind").notNull().default("handoff"),
  body: text("body").notNull(),
  artifacts: text("artifacts").notNull().default("[]"),
  gitRef: text("git_ref"),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
  deliveredAt: integer("delivered_at"),
  acknowledgedAt: integer("acknowledged_at"),
}, (table) => [
  index("idx_session_messages_task_created").on(table.taskId, table.createdAt),
  index("idx_session_messages_to_status").on(table.toSessionId, table.status),
]);
