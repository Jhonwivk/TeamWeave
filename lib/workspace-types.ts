export type Workspace = {
  id: string;
  repositoryId: string;
  workerId: string | null;
  localPath: string | null;
  baseBranch: string;
  workingBranch: string | null;
  status: "queued" | "claiming" | "preparing" | "ready" | "stopped" | "failed" | string;
  error: string | null;
  createdAt: number;
  lastActiveAt: number;
  updatedAt: number;
  repository?: string;
  repositoryUrl?: string;
};

export type WorkspaceEvent = {
  id: number;
  workspaceId: string;
  kind: string;
  message: string;
  payload: Record<string, unknown> | null;
  createdAt: number;
};

export type WorkspaceProcess = {
  id: string;
  ownerId: string;
  workspaceId: string;
  workerId: string | null;
  pid: number;
  parentPid: number | null;
  name: string;
  command: string | null;
  cwd: string | null;
  status: string;
  startedAt: number | null;
  lastSeenAt: number;
  updatedAt: number;
};

export type WorkspacePort = {
  id: string;
  ownerId: string;
  workspaceId: string;
  workerId: string | null;
  processId: string | null;
  pid: number | null;
  host: string;
  port: number;
  protocol: string;
  label: string | null;
  url: string | null;
  status: string;
  firstSeenAt: number;
  lastSeenAt: number;
  updatedAt: number;
};

export type WorkspaceFile = {
  id: string;
  ownerId: string;
  workspaceId: string;
  workerId: string | null;
  path: string;
  kind: "file" | "directory" | string;
  size: number;
  modifiedAt: number | null;
  status: string;
  lastSeenAt: number;
  updatedAt: number;
};

export type TerminalSession = {
  id: string;
  ownerId: string;
  workspaceId: string;
  workerId: string | null;
  shell: string;
  cwd: string | null;
  cols: number;
  rows: number;
  pid: number | null;
  status: string;
  exitCode: number | null;
  error: string | null;
  createdAt: number;
  lastActiveAt: number;
  updatedAt: number;
};

export type TerminalEvent = {
  id: number;
  ownerId: string;
  workspaceId: string;
  terminalId: string;
  kind: string;
  data: string | null;
  payload: Record<string, unknown> | null;
  createdAt: number;
};
