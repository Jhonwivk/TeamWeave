# TeamWeave V0.2 Development Workspace

V0.2 在现有 Agent Control Plane 之上增加一个产品级 **DevelopmentWorkspace**。它的目标是把 Repository、真实本地开发目录、Agent Session、Terminal、Process、Port 与 Preview 收敛成一个可持续存在的开发环境，同时保留 V0.1 已有的 Task / Session / Handoff / PR Gate 语义。

## 两种 Workspace 不应混淆

TeamWeave 现在存在两个不同层级的 workspace 概念：

1. **DevelopmentWorkspace**：TeamWeave 控制面的一级实体。它表示“某个 Repository 在某个 Local Worker 上的开发环境”，可以跨 Task 存活，并承载后续 Terminal、Process、Port、Preview。
2. **Herdr workspace**：Runtime 内部用于恢复终端 Pane / Agent 进程的句柄。现有 `agent_sessions.workspace_id` 保存的是这一层的 runtime ID。

因此：

- `tasks.workspace_id` → 引用 `development_workspaces.id`；
- `agent_sessions.workspace_id` → 暂时继续保存 Herdr runtime workspace handle；
- V0.2 不改变现有 Herdr Session 恢复协议。

后续如果 runtime abstraction 继续扩大，可以将 Agent Session 上的字段显式重命名为 `runtime_workspace_id`，但这不是 TW-21 的必要条件。

## Domain model

```text
Repository
    │
    ├── DevelopmentWorkspace  (repository + worker 唯一)
    │      ├── localPath
    │      ├── baseBranch
    │      ├── workingBranch
    │      ├── status
    │      ├── WorkspaceProcess[]
    │      └── WorkspacePort[]
    │
    └── Task[]
           ├── workspaceId?  → DevelopmentWorkspace
           └── AgentSession[]
                  └── workspaceId? → Herdr runtime workspace handle
```

## 生命周期

V0.2 预期生命周期：

```text
Repository imported
      ↓
Worker selected / task claimed
      ↓
DevelopmentWorkspace preparing
      ↓
clone or reuse local repository
      ↓
DevelopmentWorkspace ready
      ↓
Task / Agent / Human terminal share the environment
      ↓
process + port discovery
      ↓
Preview
```

DevelopmentWorkspace 默认跨 Task 复用，因此控制面按 `(repository_id, worker_id)` 保证唯一。当前 Worker 仍使用一个 repository checkout 并安全切换 TeamWeave 工作分支；并行 worktree 属于 V0.4，而不是 V0.2。

## 状态建议

`development_workspaces.status` 初始支持：

- `preparing`
- `ready`
- `busy`
- `error`
- `offline`

`workspace_processes.status` 初始支持：

- `running`
- `stopped`

`workspace_ports.status` 初始支持：

- `listening`
- `closed`

这些状态暂时使用文本字段，Worker 生命周期协议稳定后再决定是否收窄为代码级 union。

## V0.2 边界

本版本包含：

- DevelopmentWorkspace 持久化；
- Worker create/reuse lifecycle；
- Browser terminal / PTY；
- process / port discovery；
- localhost/private preview；
- Workspace shell UI。

本版本不包含：

- 公网 Preview 域名和分享 tunnel；
- 多 Agent 并行 worktree；
- 自动 merge；
- 任意 DAG workflow；
- 新的 Agent orchestration semantics。

现有原则保持不变：**控制面负责语义，Runtime 负责进程；跨 Session 通信必须持久化；GitHub 交付继续由人工门禁控制。**
