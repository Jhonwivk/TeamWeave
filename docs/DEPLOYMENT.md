# 部署与 Worker 配置

TeamWeave 由一个远程控制面和至少一个本地 Worker 组成。控制面保存可共享、可恢复的状态；Worker 在持有源码、Agent 登录态和 GitHub 凭据的机器上执行任务。

## 组成

| 部分 | 推荐位置 | 必需能力 |
| --- | --- | --- |
| Web + API | Cloudflare Workers 兼容环境 | ChatGPT 身份、D1 Binding |
| D1 | 与控制面同一部署 | Binding 名称 `DB` |
| Local Worker | 开发者电脑或受控执行机 | Node、Git、至少一个 Agent CLI |
| Herdr | 与 Local Worker 同机 | 推荐；`auto` 模式可降级 |
| GitHub CLI | 与 Local Worker 同机 | 私有仓库访问和创建 PR |

## 控制面要求

- Node.js 22.13 或更高版本；
- Cloudflare Workers 兼容的 Vinext 构建环境；
- 名为 `DB` 的 D1 Binding；
- 浏览器端 ChatGPT 身份注入；
- Local Worker 能通过 HTTPS 访问 `/api/worker/*`。

本仓库包含 `.openai/hosting.json` 和 D1 迁移。使用 Sites 部署时，平台负责构建与 Binding；在其他 Cloudflare 环境中部署时，需要自行创建 D1 数据库、绑定 `DB`，并执行 `drizzle/` 中的迁移。

### 入口可达性

Worker 使用 Bearer Token 调用 API。如果站点入口还有只允许浏览器访问的外层门禁，该门禁可能先于应用 API 拒绝本地 Worker。

远程真实执行需要满足以下任一条件：

1. 站点入口可公开访问，同时保留 TeamWeave 的浏览器身份校验和 Worker Token 校验；
2. 为 Worker 提供不会绕过应用层鉴权的可信网络通道；
3. 将控制面与 Worker 部署在同一受控网络。

不要为了让 Worker 连通而删除 `requireOwner` 或 `requireWorker` 校验。

## 安装本地依赖

### 1. Git 和 GitHub CLI

安装 [GitHub CLI](https://cli.github.com/) 后，在 Worker 所在用户下登录：

```bash
gh auth login
gh auth setup-git
gh auth status
```

TeamWeave 不上传这些凭据。克隆、推送和创建 PR 都由本机 `git` / `gh` 完成。

### 2. Coding Agent

至少安装并登录一个受支持的 Agent CLI：

- Direct + Herdr：`pi`、`codex`、`claude`、`gemini`、Cursor Agent（`agent`）、`copilot`、`opencode`、`qwen`
- Direct-only：`aider`
- Herdr-only（由 Herdr 适配）：`kimi`、`kiro-cli`、`droid`、`amp`、`devin`、`cline`、`qodercli`

Worker 会通过各命令的 `--version` 自动探测能力。命令必须位于启动 Worker 时的 `PATH` 中；Cursor Agent 默认探测 `agent`，Kiro/Qoder 支持其常见命令别名。

### 3. Herdr

推荐按 [Herdr 安装文档](https://herdr.dev/docs/install/) 安装。常见方式：

```bash
brew install herdr
```

或：

```bash
curl -fsSL https://herdr.dev/install.sh | sh
```

安装后先运行一次：

```bash
herdr
```

Herdr Server 会成为 Agent 进程的父环境。请从最小权限的终端启动，避免继承与任务无关的密钥。

## 注册并启动 Worker

1. 登录 TeamWeave。
2. 打开 **Workers** 页面。
3. 输入执行机名称并点击生成 Token。
4. 立即复制页面给出的启动命令；原始 Token 只显示一次。

命令形式如下：

```bash
curl -fsSLo agentmux-worker.mjs https://YOUR_CONTROL_PLANE/agentmux-worker.mjs
AGENTMUX_URL=https://YOUR_CONTROL_PLANE \
AGENTMUX_TOKEN=amx_REDACTED \
node agentmux-worker.mjs
```

成功启动后会输出主机平台、探测到的 Agent 和 Runtime。控制台通常在一次轮询周期内显示 Worker 在线。

### 环境变量

| 变量 | 必需 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `AGENTMUX_URL` | 是 | 无 | 控制面根 URL，不含结尾斜杠也可 |
| `AGENTMUX_TOKEN` | 是 | 无 | Worker 注册时生成的一次性展示 Token |
| `AGENTMUX_WORKDIR` | 否 | `~/.agentmux/workspaces` | 仓库克隆和任务工作目录 |
| `AGENTMUX_HERDR_TIMEOUT` | 否 | `1800000` | 等待 Herdr Agent 的毫秒数 |
| `AGENTMUX_ACTORS` | 否 | 全部 | 逗号分隔的 actor 白名单，例如 `codex,gemini,aider` |

变量名称暂时保留 `AGENTMUX_*`，以兼容现有 Worker 和部署。

### Development Workspace 生命周期

在控制台的 **Repositories → Open workspace** 创建工作区后，Worker 会优先领取 Workspace 作业，再执行以下步骤：

1. 在 `AGENTMUX_WORKDIR` 下按 Workspace ID 选择或创建本地 checkout；
2. 使用 `gh repo clone`（可用时）或 `git clone`，随后 `git fetch origin --prune`；
3. 从 `baseBranch` 创建或复用 `workingBranch`，并写入 TeamWeave 的 Git 提交身份；
4. 通过 `/api/worker/events` 报告 `claiming`、`preparing`、`ready` 或 `failed`，包括本地路径和工作分支。

Workspace 进入 `ready` 后，**Workspaces → Terminal** 会启动一个由同一 Worker 托管的交互 Shell。浏览器命令通过 `/api/workspaces/:id/terminal` 排队，Worker 通过 `/api/worker/poll` 领取 `terminal` 作业，再从 `/api/worker/terminal` 回传输出和状态。终端只访问本机 Workspace checkout，不会把源码上传到控制面。

如果终端显示 `Workspace directory is not available`，先确认 Worker 的 `AGENTMUX_WORKDIR` 没有被清理，并检查 Workspace 页面记录的 `localPath`。如果 Worker 重启，重新启动 Worker 后发送第一条命令即可让它在同一路径重新接管终端；如果命令停留在 `claimed` 超过一分钟，下一次轮询会自动重新排队。

控制面只把 Workspace 元数据写入 D1，不上传源码和 Git 凭据。Worker 在 `claiming` / `preparing` 阶段断线超过一分钟后，原 Worker 下一次轮询会重新领取并继续准备；`stopped` / `failed` 工作区可由控制台 **Queue again**。

生产环境建议使用系统服务和本机 Secret Store 注入变量，不要把 Token 写入仓库、Shell 历史或镜像。

## Runtime 模式

| 模式 | 行为 |
| --- | --- |
| `auto` | 按每个 Session 选择最佳 Runtime；优先 Herdr，Direct-only actor 使用 CLI |
| `herdr` | 只允许支持 Herdr 的 Worker 领取 |
| `direct` | 直接启动 Agent CLI，不创建持久 Herdr Session |

需要跨 Session 人工恢复时应选择 `herdr`。`auto` 也会为支持 Herdr 的 actor 建立持久 Session；Direct CLI 支持单/多 Agent 顺序执行，但进程结束后不能恢复原终端上下文。

## 仓库连接

在 **Repositories** 页面输入 `owner/repository`。控制面只保存地址、默认分支和可见性：

- 公开仓库会尝试从 GitHub 公共 API补全元数据；
- 私有仓库可能显示 `unknown`，最终访问权由本地 `gh` 登录验证；
- 每个 Task 从所选 `baseBranch` 创建 `teamweave/<task-id>` 分支；
- 关联 Development Workspace 的 Task 会等待 Workspace `ready`，然后复用其本地 checkout 和 working branch；
- 执行完成会推送隔离分支，但必须人工批准才创建 PR。

## 本地开发

```bash
npm run install:ci
npm run dev
```

验证生产构建和协议测试：

```bash
npm test
```

生成数据库迁移：

```bash
npm run db:generate
```

## 故障排查

### Worker 一直 Offline

- 检查 `AGENTMUX_URL` 是否能从 Worker 机器访问；
- 检查外层站点门禁是否在应用 API 之前返回 401/403；
- 重新注册 Worker，排除 Token 复制错误；
- 确认本机时间没有明显漂移。

### 没有任务被领取

- Worker 输出的 `Detected actors` 必须覆盖任务所有 Session；
- `herdr` 任务要求 Worker 探测到 Herdr；
- 恢复任务只能由原 Worker 领取；
- 检查任务是否处于 `queued`、`publish_requested` 或 `resume_requested`。
- 如果任务绑定了 Workspace，先确认 Workspace 状态为 `ready`，且仍归属于当前 Worker。

### 克隆或推送失败

```bash
gh auth status
gh auth setup-git
git ls-remote https://github.com/OWNER/REPOSITORY.git HEAD
```

私有仓库还需确认当前 GitHub 账号对目标仓库有写权限。

Workspace 失败时，先查看 **Workspaces** 页面显示的 `error`、`baseBranch` 和 `workingBranch`；修复本机 GitHub 登录或清理本地 checkout 后点击 **Queue again**。Worker 会复用同一 Workspace ID，但会在不可信的旧路径之外选择当前机器的 `AGENTMUX_WORKDIR` 作为安全回退路径。

### Herdr 超时或无法恢复

- 确认 Herdr Server 仍由同一 OS 用户运行；
- 检查控制台中的 Workspace/Pane 标识；
- 适当增加 `AGENTMUX_HERDR_TIMEOUT`；
- 如果 Session 已被手动删除，使用 Retry 创建新的执行 attempt。

### PR 创建失败

- 确认分支已成功推送；
- 确认 `gh auth status` 对目标 Host 有效；
- 确认账号具有 Pull Request 权限；
- 修复后在控制台 Retry，或对处于 Review 的任务重新批准。
