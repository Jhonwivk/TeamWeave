# TeamWeave

TeamWeave 是一个面向真实 Coding Agent 的本地优先控制面。它把 Pi、Codex、Claude Code 变成可观察、可恢复、可审批的执行单元，同时支持单 Agent 任务和多 Agent 顺序协作。

它不是聊天界面，也不把多个模型简单放进同一个群聊。控制面保存任务、Session、handoff、执行事件与人工决策；本地 Worker 负责调用真实 Agent、管理 Git 分支，并在批准后创建 Pull Request。

> 当前状态：可运行 MVP。支持持久化控制面、本地 Worker、Herdr Session、跨 Session handoff、GitHub 隔离分支和人工 PR 门禁。

## 核心能力

| 能力 | 当前实现 |
| --- | --- |
| 单 Agent | Pi、Codex、Claude Code 任一 Agent 独立执行 |
| 多 Agent | 2–4 个 Session 按自定义角色和顺序协作 |
| Agent Runtime | 优先使用 Herdr，未安装时可降级到直接 CLI |
| 跨 Session 通信 | 持久化 handoff，包含摘要、产物路径、Git ref 和投递状态 |
| 并行 Agent | 多 Agent 可选择 parallel 模式，各自使用 git worktree 后合并 |
| 常用 Agent | Pi、Codex、Claude、Cursor、Aider、Gemini、OpenCode、Goose、Amazon Q 等 |
| 人工介入 | Agent 阻塞时在控制台回复，并恢复原 Herdr Session |
| Git 隔离 | 每个任务使用独立分支，多 Session 顺序修改同一分支 |
| GitHub 交付 | 分支先供人工检查，批准后才创建 PR；不会自动合并 |
| 故障恢复 | Worker 心跳、任务重领、Herdr Session 标识和幂等消息 |

## 工作方式

```mermaid
flowchart TD
    UI[TeamWeave 控制面] --> CP[任务与事件存储]
    CP --> W[本地 Worker]
    W --> H[Herdr Runtime]
    W --> D[Direct CLI fallback]
    H --> A[Pi / Codex / Claude]
    D --> A
    A --> G[隔离 Git 分支]
    G --> R[人工 Review]
    R --> P[GitHub Pull Request]
```

多 Agent 任务中，上一个 Session 的输出不会依赖终端滚屏隐式传递，而是转成结构化消息：

```json
{
  "fromSessionId": "sess_planner",
  "toSessionId": "sess_implementer",
  "kind": "handoff",
  "body": "认证方案已确定，下一步实现 callback 与测试。",
  "artifacts": ["docs/auth-design.md"],
  "gitRef": "a81f3c2",
  "status": "pending"
}
```

消息状态按 `pending → delivered → acknowledged` 推进，因此即使 Worker 或 Agent 重启，也能判断交接是否完成。

## 快速了解

### 控制面

控制面是 Vinext/React 应用，运行在 Cloudflare Workers 兼容环境中：

- D1 保存仓库、Worker、任务、Agent Session、消息和事件。
- 浏览器写操作要求 GitHub OAuth 登录。
- Worker API 使用独立 Bearer Token。
- GitHub 凭据和 Agent 登录信息始终留在本地 Worker。

### 本地 Worker

准备以下工具：

- Node.js 22.13+
- Git 与 [GitHub CLI](https://cli.github.com/)
- Pi、Codex、Claude Code 中至少一个
- 推荐安装 [Herdr](https://herdr.dev/docs/install/)

先完成本机认证：

```bash
gh auth login
gh auth setup-git
herdr
```

随后在 TeamWeave 的 **Workers** 页面注册本机，复制页面生成的一次性启动命令。Worker 会自动探测已安装的 Agent 与 Herdr。

### 开发验证

```bash
npm run install:ci
npm test
```

`npm test` 会完成生产构建，并验证控制台、Herdr 运行时、跨 Session 协议和基础 UI 组件。

## 安全边界

- Agent 不接收 TeamWeave Worker Token。
- 直接 CLI 模式会移除传入 Agent 进程的 GitHub Token 环境变量。
- 每个任务使用独立工作分支。
- Agent 无权自动创建 PR、合并或修改 Git remote。
- PR 只在控制台明确批准后创建。
- 控制面只保存仓库地址，不保存本地 GitHub 登录凭据。

Herdr 由本机用户启动，Agent 会继承 Herdr Server 的本地环境。生产使用时，应从不含多余敏感环境变量的终端启动 Herdr。

## 文档

- [系统架构](docs/ARCHITECTURE.md)
- [部署与 Worker 配置](docs/DEPLOYMENT.md)
- [控制面 API](docs/API.md)

## 当前限制

- 多 Agent 支持顺序或并行执行；并行模式为每个 Session 创建独立 worktree，完成后合并到审查分支。
- Workflow 是显式 Session Pipeline，不包含自动规划任意 DAG。
- 私有 Sites 入口可能在请求到达 Worker API 前拦截本地进程；真实远程 Worker 需要公开入口加应用层认证，或等价的可信网络通道。
- 自动合并、组织级权限、预算策略和跨仓库事务尚未实现。

## 项目结构

```text
app/                         控制台与 API Routes
db/                          D1 / Drizzle 数据模型
drizzle/                     数据库迁移
lib/actors.ts               受支持 Agent 注册表
lib/auth.ts                 GitHub OAuth 与会话
lib/control-plane.ts        鉴权、ID 与数据库辅助函数
public/agentmux-worker.mjs   本地 Agent Worker
tests/                       构建和协议测试
worker/                      Cloudflare Worker 入口
docs/                        架构、部署与 API 文档
```

## 设计原则

1. **控制面负责语义，Runtime 负责进程。** Herdr 管理真实终端和 Agent 生命周期；TeamWeave 管理任务、消息、权限和因果关系。
2. **跨 Session 通信必须可持久化。** 不依赖共享聊天历史或终端滚屏。
3. **默认不自动交付。** Agent 可以写代码，Worker 可以推送隔离分支，但 PR 创建需要人工批准。
4. **单 Agent 与多 Agent 共用同一抽象。** 单 Agent 只是只有一个 Session 的 Pipeline。
