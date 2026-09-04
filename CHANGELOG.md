# Changelog

## [0.2.0] - 2026-09-04

### Added

- Development Workspace 生命周期：Worker claim、clone/reuse、隔离分支和恢复。
- 浏览器 Workspace Terminal，命令队列和输出事件持久化到 D1。
- Worker 进程和本地 TCP 端口发现。
- localhost 内嵌 Preview，支持刷新和新标签页打开。
- 只读 Workspace Files 索引：目录、文件大小、更新时间和路径过滤。
- 面向商用产品的 Overview、Repositories、Workspaces、Workers、Activity 和 Workspace Shell UI。
- 主流 Agent Actor 的 Herdr/Direct CLI 路由与跨 Session handoff。
- GitHub 分支交付和人工批准后的 Pull Request gate。

### Security

- Files 索引跳过 Git internals、依赖目录、构建产物、缓存和常见密钥文件。
- Worker 子进程不继承 TeamWeave Worker Token 或常见 GitHub Token。
- Preview 保持 localhost-only，不暴露公网 tunnel。

### Known limitations

- 多 Agent 仍是同一分支上的顺序执行。
- Files 只提供元数据，尚未提供在线文件内容和编辑。
- 控制台仍使用轮询，尚未引入 SSE/WebSocket 事件流。
- 尚未支持多人权限、GitHub App/Webhook、自动合并、自动部署和公网 Preview。
