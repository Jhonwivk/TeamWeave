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

export const developmentWorkspaces = sqliteTable("development_workspaces", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  repositoryId: text("repository_id").notNull().references(() => repositories.id),
  workerId: text("worker_id").references(() => workers.id),
  localPath: text("local_path"),
  baseBranch: text("base_branch").notNull().default("main"),
  workingBranch: text("working_branch"),
  status: text("status").notNull().default("queued"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  lastActiveAt: integer("last_active_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("idx_development_workspaces_owner_status_updated").on(table.ownerId, table.status, table.updatedAt),
  index("idx_development_workspaces_worker_status").on(table.workerId, table.status),
  index("idx_development_workspaces_repository_status").on(table.repositoryId, table.status),
]);

export const workspaceEvents = sqliteTable("workspace_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: text("workspace_id").notNull().references(() => developmentWorkspaces.id),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  payload: text("payload"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_workspace_events_workspace_created").on(table.workspaceId, table.createdAt),
]);

export const workspaceTerminals = sqliteTable("workspace_terminals", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => developmentWorkspaces.id),
  workerId: text("worker_id").references(() => workers.id),
  shell: text("shell").notNull().default("bash"),
  cwd: text("cwd"),
  cols: integer("cols").notNull().default(120),
  rows: integer("rows").notNull().default(32),
  pid: integer("pid"),
  status: text("status").notNull().default("queued"),
  exitCode: integer("exit_code"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  lastActiveAt: integer("last_active_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("idx_workspace_terminals_owner_workspace_status").on(table.ownerId, table.workspaceId, table.status),
  index("idx_workspace_terminals_worker_status").on(table.workerId, table.status),
]);

export const workspaceTerminalCommands = sqliteTable("workspace_terminal_commands", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => developmentWorkspaces.id),
  terminalId: text("terminal_id").notNull().references(() => workspaceTerminals.id),
  workerId: text("worker_id").references(() => workers.id),
  kind: text("kind").notNull(),
  payload: text("payload"),
  status: text("status").notNull().default("queued"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  claimedAt: integer("claimed_at"),
  completedAt: integer("completed_at"),
}, (table) => [
  index("idx_workspace_terminal_commands_workspace_status_created").on(table.workspaceId, table.status, table.createdAt),
  index("idx_workspace_terminal_commands_worker_status").on(table.workerId, table.status),
]);

export const workspaceTerminalEvents = sqliteTable("workspace_terminal_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: text("owner_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => developmentWorkspaces.id),
  terminalId: text("terminal_id").notNull().references(() => workspaceTerminals.id),
  kind: text("kind").notNull(),
  data: text("data"),
  payload: text("payload"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_workspace_terminal_events_terminal_created").on(table.terminalId, table.createdAt),
]);

export const workspaceProcesses = sqliteTable("workspace_processes", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => developmentWorkspaces.id),
  workerId: text("worker_id").references(() => workers.id),
  pid: integer("pid").notNull(),
  parentPid: integer("parent_pid"),
  name: text("name").notNull(),
  command: text("command"),
  cwd: text("cwd"),
  status: text("status").notNull().default("running"),
  startedAt: integer("started_at"),
  lastSeenAt: integer("last_seen_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_workspace_processes_workspace_pid").on(table.workspaceId, table.pid),
  index("idx_workspace_processes_owner_workspace_status").on(table.ownerId, table.workspaceId, table.status),
  index("idx_workspace_processes_worker_last_seen").on(table.workerId, table.lastSeenAt),
]);

export const workspacePorts = sqliteTable("workspace_ports", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => developmentWorkspaces.id),
  workerId: text("worker_id").references(() => workers.id),
  processId: text("process_id"),
  pid: integer("pid"),
  host: text("host").notNull().default("127.0.0.1"),
  port: integer("port").notNull(),
  protocol: text("protocol").notNull().default("http"),
  label: text("label"),
  url: text("url"),
  status: text("status").notNull().default("listening"),
  firstSeenAt: integer("first_seen_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_workspace_ports_workspace_protocol_port").on(table.workspaceId, table.protocol, table.port),
  index("idx_workspace_ports_owner_workspace_status").on(table.ownerId, table.workspaceId, table.status),
  index("idx_workspace_ports_worker_last_seen").on(table.workerId, table.lastSeenAt),
]);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  repositoryId: text("repository_id").notNull().references(() => repositories.id),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  actor: text("actor").notNull(),
  model: text("model"),
  workspaceId: text("workspace_id").references(() => developmentWorkspaces.id),
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
