# TeamWeave V0.2.0 Code Review

审查日期：2026-09-04  
审查基线：`719778d5f3684d7c7f381d6852d8aef2c72b8014`（V0.2 Files index 发布前）

这是一轮面向商用发布的静态代码审查，覆盖 Control Plane API、D1 schema/migrations、Local Worker、Workspace Shell UI、鉴权边界和发布文档。它不是渗透测试，也不替代真实多机网络和浏览器兼容性测试。

## 结论

V0.2.0 可以作为单用户、本地优先的开发工作区版本发布。核心边界是清晰的：Control Plane 负责任务、Session、消息、权限和审计；Local Worker 负责本地 checkout、PTY、Agent 进程、进程/端口和文件元数据；GitHub 负责分支和 Pull Request。

发布前本轮已修复或收敛的工程问题：

- Workspace Files、Preview、Surface Header 从 `app/console.tsx` 中拆出为独立组件；Workspace/Terminal/Process/Port/File 类型集中到 `lib/workspace-types.ts`，时间和大小格式化集中到 `lib/format.ts`。
- File snapshot 采用相对路径、数量、深度和大小上限，服务端再次校验路径；`.git`、依赖目录、构建产物、缓存、`.env` 和常见证书密钥文件不会进入索引。
- 文件索引通过工作区和 Worker 绑定、按路径幂等更新；缺席记录标记为 `stale`，不会把一个 Worker 的数据写入另一个工作区。
- 文件扫描与进程/端口扫描分离节奏：进程/端口约每 5 秒，文件索引约每 15 秒，避免大型仓库持续高频扫描。
- 发布流程包含数据库迁移、生产构建、lint、TypeScript、Worker 语法和协议测试，且部署前再次检查私有 Site 访问策略。

## Findings

| 等级 | 领域 | 当前结论 | 后续动作 |
| --- | --- | --- | --- |
| High | 本地网络边界 | Preview 加载连接 Worker 的机器上的 `localhost`，不是云端代理；浏览器可能阻止 HTTPS 页面嵌入 HTTP localhost | V0.2 保留 “Open in new tab” 兜底；V1 再评估受控 tunnel/proxy |
| Medium | 实时性 | 控制台状态使用 4 秒轮询，Terminal 使用约 900ms 增量轮询，尚未使用 SSE/WebSocket | V0.3 引入事件流；保持 D1 作为恢复源 |
| Medium | GitHub 集成 | 当前保存仓库地址，私有访问由本地 `gh` 验证；没有 GitHub App、Webhook、CI 状态和 Issue 面板 | V0.3/V1 增加集成，不把凭据移入 Control Plane |
| Medium | 并发模型 | 多 Agent 是同一分支顺序执行，没有并行 worktree、自动合并或冲突处理 | V0.4 单独设计 Worktree/Merge 协议 |
| Medium | 多租户 | 当前 owner 身份和 owner-scoped 查询适合单用户；没有组织、成员、RBAC、SSO | V0.5 再引入，不提前污染 V0.2 数据模型 |
| Low | 文件能力 | Files 目前只展示安全元数据，不读取内容、不编辑、不提供远程写文件接口 | 后续增加受控内容查看和 Diff，而不是把 Worker 变成任意文件服务器 |
| Low | Worker 分发 | Worker 是独立脚本，Actor Registry 在控制面和 Worker 各维护一份 | 后续生成或版本化 registry；V0.2 保持下载即运行和离线可用 |

## 已验证的安全不变量

1. 浏览器 API 只接受部署平台注入的可信 owner identity，不接受客户端传入 owner id。
2. Worker API 只接受注册 Token 的 SHA-256 Hash，所有 workspace/task 查询同时校验 owner 和 worker。
3. Worker 子进程不会继承 TeamWeave Worker Token 或常见 GitHub Token。
4. Agent 只能在工作区 checkout 和隔离分支中执行；PR 创建仍需要人工批准。
5. Files 只传递有限的相对路径和元数据；符号链接不会被跟随，服务端拒绝绝对路径和 `..` 路径。
6. Preview URL 只允许 `http(s)://localhost:<port>`，不把 Worker 本地地址公开成公网入口。

## 发布门禁

- `npm run lint`
- `npx tsc --noEmit`
- `npm test`（生产构建 + 协议/UI 静态回归）
- `node --check public/agentmux-worker.mjs`
- `git diff --check`
- D1 迁移存在且生产表结构包含 `workspace_files`
- Site 保持 owner-only，部署错误日志为空

## 不在 V0.2 的问题

公网 Preview、自动部署、自动合并、并行 Agent、多人权限、计费/预算、跨仓库事务和企业 SSO 都是后续版本议题，不以临时开关的形式混入 V0.2。
