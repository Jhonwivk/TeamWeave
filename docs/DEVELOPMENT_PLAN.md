# TeamWeave Development Plan

版本基线：V0.2.0  
发布日期：2026-09-04  
仓库：[Jhonwivk/TeamWeave](https://github.com/Jhonwivk/TeamWeave)

## 产品方向

TeamWeave 是一个本地优先的 heterogeneous Agent development workspace：

```text
Repository → Workspace → Agent/Terminal → Review → GitHub PR
                         ↘ Handoff / Decision / Audit
```

系统坚持两条边界：Control Plane 负责语义、权限和持久化；Runtime/Worker 负责真实进程、终端和 Agent CLI。第一阶段先解决单用户 Human-Agent 协作开发，第二阶段再研究多人团队组织模式。

## 已发布：V0.2.0 Development Workspace

### 范围

- TW-21：Development Workspace domain model 和生命周期
- TW-22：Worker claim、clone/reuse、隔离工作分支和恢复
- TW-23：持久化 Browser Terminal / PTY bridge
- TW-24：Workspace process & port discovery
- TW-25：localhost 内嵌 Preview
- TW-26：商业化 Workspace Shell UI
- 补充：只读 Workspace Files index

### 验收标准

用户可以连接 GitHub 仓库、注册本地 Worker、打开 Workspace，在真实 checkout 中运行 Terminal 命令，看到进程/端口、Preview 和文件结构，发起真实 Pi/Codex/Claude 等 Agent 任务，并在人工批准后创建 GitHub PR。

### 明确不做

公网域名、Tunnel、分享链接、自动部署、文件内容编辑、并行 Agent、组织权限和自动合并。

## V0.3 Collaboration Thread 2.0

目标：把“Agent 输出”升级为可审计的协作事件流。

建议拆分（尚未创建 GitHub Issue）：

| Issue | 内容 | 验收标准 |
| --- | --- | --- |
| TW-30 | `CollaborationEvent` schema/migration | 支持 MESSAGE、TASK_ASSIGNED、HANDOFF、ARTIFACT_CREATED、REVIEW_REQUESTED、CHANGE_REQUESTED、DECISION、APPROVED、BLOCKED |
| TW-31 | Event projection API | Task、Session、Workspace 的现有事件统一投影，跨 Session 仍可持久化恢复 |
| TW-32 | Collaboration timeline UI | 按时间显示 Human、Agent、Runtime、Git ref、Artifacts 和状态变化 |
| TW-33 | `@agent` assignment | 从 Workspace Thread 指派现有 Actor，复用现有 Worker/Session 调度 |
| TW-34 | Review/Decision flow | Change Request、人工回复、批准、拒绝和决策理由可追踪 |
| TW-35 | Live event stream | SSE 优先，断线后用 cursor 从 D1 恢复；不以 WebSocket 内存状态作为唯一来源 |

退出条件：一个任务可以展示“分派 → 执行 → handoff → review → change request → 修复 → approve”的完整时间线，且刷新页面或 Worker 重启后不丢失。

## V0.4 Parallel Agents

目标：在安全隔离的 worktree 中并行运行真实 Agent。

- 一个 Task 创建多个 worktree/branch，而不是共享同一工作树。
- Agent 结果必须带 commit、changed paths 和验证结果。
- Control Plane 负责合并计划、冲突检测和人工 Merge gate。
- 冲突解决必须是显式 Task/Decision，不允许 Worker 静默覆盖变更。
- 保留 V0.3 的 handoff 和审计链，不能退回共享聊天历史。

退出条件：两个 Agent 能在相同基线并行修改，系统能展示冲突文件、阻止自动覆盖，并在人工决策后完成合并。

## V0.5 Human-Agent Team

目标：支持真实的多人 Human-Agent 工程团队。

- Project/Workspace 成员、邀请、角色和 RBAC
- Human 与 Agent 的 mention、订阅、通知和 presence
- 多人 Review、Decision quorum、审批权限和审计导出
- Agent team 配置、能力路由、预算/并发策略
- 组织级 GitHub 连接与分支保护适配

这一阶段才引入多人共享状态，避免在单用户 V0.2/V0.3 提前设计复杂组织模型。

## V1.0 TeamWeave

完成 heterogeneous Human-Agent engineering workspace：

- 统一 Actor/Executor adapter，Pi 只是可插拔 execution kernel，系统不绑定单一内核
- 多人协作、并行 Agent、决策协议和可恢复事件流
- 受控文件查看/Diff、CI/Webhook、GitHub 深度集成
- 可选的私有 Preview tunnel、部署和分享能力
- 评测面板：交付时间、人工介入次数、冲突率、恢复率、Review 通过率和 Agent 协作质量

## Release policy

1. 每个版本只承诺一个可验收的产品闭环。
2. 数据库迁移、Worker 脚本、控制台和文档必须同一提交发布。
3. 每次发布都运行构建、lint、TypeScript、协议测试和 Worker 语法检查。
4. 生产部署前检查 Site access policy；当前保持 owner-only。
5. 不把公网 tunnel、自动部署和多人权限作为 V0.x 的隐式依赖。

## 当前下一步

V0.3 的第一个 Epic 是 `Collaboration Thread 2.0`，优先实现持久化事件模型和 Review/Decision UI；在此之前不启动并行 Worktree，也不继续横向增加 Actor 类型。
