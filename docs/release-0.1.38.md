# Skill-Space 0.1.38 Release Notes

## 中文

### 重点修复

- 修复在线更新检查时 `EPIPE: broken pipe` 导致 Electron 主进程崩溃的问题。
- 主页“需要关注”告警现在支持单条关闭，不会长期停留在首页。
- 设置页后台定时守护错误支持一键清空，并会同步刷新守护状态。
- 飞书确认消息去重，避免重复出现“请回复数字”“我在等待你的回复”等提示。
- 飞书长确认内容改为更保守的分段发送，降低选题、确认事项和工作总结被截断的概率。

### 功能保持

- 工作流库：已安装、云端库、已上传视图。
- 模板发布：生成模板包、提取运行必填配置、执行敏感信息审计。
- LLM 管家：总览连续对话、飞书意图路由、技能详情中的 `SKILL.md` 修改建议。
- 自动化：一次、每天、每周、每月、间隔触发和后台定时守护。
- 多智能体：Claude Code、Codex CLI、OpenClaw、Hermes Agent、自定义 CLI。

### 验证

已通过：

```powershell
npm run typecheck
npm run test:all
npm run build
electron-builder --win nsis --x64
```

## English

### Fixes

- Fixed an updater `EPIPE: broken pipe` crash in the Electron main process.
- Dashboard alerts can now be dismissed individually.
- Background scheduler errors can be cleared from Settings.
- Feishu confirmation messages now remove duplicate confirmation prompts.
- Long Feishu confirmation content is chunked more conservatively to reduce truncation.

### Preserved Features

- Workflow library with installed, cloud, and uploaded views.
- Template publishing with package generation, required configuration extraction, and safety review.
- LLM steward for dashboard chat, Feishu intent routing, and skill editing.
- Automation schedules and silent background guard.
- Multi-agent execution through Claude Code, Codex CLI, OpenClaw, Hermes Agent, and custom CLI profiles.

### Verification

Passed:

```powershell
npm run typecheck
npm run test:all
npm run build
electron-builder --win nsis --x64
```
