# Skill-Space Blueprint / 产品蓝图

Skill-Space is a local-first SkillOps desktop application for turning reusable AI-agent workflows into universal `SKILL.md` skills. It manages skills created from Codex, Claude Code, OpenClaw, Hermes Agent, and compatible CLI agents, then lets the user inspect, version, import, publish, schedule, and execute those skills from one visual workspace.

Skill-Space 是一个本地优先的 SkillOps 桌面应用，用于把 AI Agent 工作流沉淀为通用 `SKILL.md` 技能。它面向 Codex、Claude Code、OpenClaw、Hermes Agent 以及兼容 CLI 智能体，提供技能管理、运行、定时、发布、飞书协同和在线更新。

## Product Principles / 产品原则

- Local first: user data, skills, runs, logs, and automation state are stored locally by default.
- Universal skill standard: every skill remains readable by agents that only understand `SKILL.md`.
- Skill-Space extensions are additive: visual workflow, permissions, schemas, adapters, and marketplace metadata live under `.skillspace/`.
- Human confirmation is respected: workflows that ask the user to choose or confirm must not be silently auto-approved.
- Template sharing must sanitize private data before upload.

## Architecture / 架构

```text
Electron main process
  - filesystem and config ownership
  - skill registry scanning
  - CLI agent execution
  - run events and artifact collection
  - scheduler, Feishu, updater, and marketplace APIs

Renderer process
  - Liquid Glass workspace UI
  - dashboard, skills, marketplace, runs, automation, agents, Feishu, settings
  - LLM steward chat and skill editing surfaces

Preload bridge
  - typed IPC only
  - no unrestricted Node access in the renderer
```

## Local Data Root / 本地数据根目录

The user can change the local storage root in Settings. A typical data root contains:

```text
Skill-Space/
  skills/
  runs/
  logs/
  artifacts/
  automations/
  marketplace/
  publish/
  registry/
  config/
```

## Visual Style / 视觉风格

Skill-Space uses an Apple Liquid Glass-inspired desktop style:

- translucent panels with blur and subtle highlights
- dark/light theme switching
- compact, information-dense work surfaces
- responsive cards that avoid text overflow
- right-side inspector for selected skill details
- no marketing landing page; the first screen is the actual workspace

## Universal Skill Package / 通用技能包

Skill-Space must remain compatible with existing `SKILL.md` skills:

```text
my-skill/
  SKILL.md
  agents/
    openai.yaml
  scripts/
  references/
  assets/
  .skillspace/
    manifest.json
    workflow.yaml
    inputs.schema.json
    outputs.schema.json
    permissions.json
    adapters.json
```

`SKILL.md` is the canonical human and agent-readable instruction file. `.skillspace/` contains optional Skill-Space metadata.

## Workflow Format / 工作流格式

`.skillspace/workflow.yaml` describes the visual graph and execution plan:

```yaml
schemaVersion: skillspace.workflow.v1
nodes:
  - id: capture_context
    type: agent_step
    title: Capture Context
    prompt: Read the workspace context and summarize task constraints.
  - id: wait_for_user
    type: approval
    title: User Confirmation
    prompt: Ask the user to confirm the selected option.
  - id: final_output
    type: agent_step
    title: Final Output
    prompt: Produce the final result and list artifacts.
edges:
  - from: capture_context
    to: wait_for_user
  - from: wait_for_user
    to: final_output
```

Supported node categories include agent steps, commands, approvals, file reads/writes, scripts, and generated summaries.

## Agent Adapters / 智能体适配器

All agents are represented as configurable CLI profiles:

```ts
export interface AgentAdapter {
  id: string;
  label: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  checkHealth(): Promise<AgentHealth>;
  execute(request: SkillRunRequest): AsyncIterable<RunEvent>;
}
```

Built-in presets include:

- Claude Code
- Codex CLI
- OpenClaw
- Hermes Agent through WSL
- Gemini CLI, Qwen Code, Aider, OpenCode, and custom agents when detected or configured

## Creation Modes / 技能创建方式

Skill-Space supports:

- Agent workflow capture: use the bundled `skill-space` skill after a workflow succeeds.
- Manual import: import a folder, zip, standalone `SKILL.md`, or compatible skill package.
- Local scanning: scan common agent skill directories.
- LLM-assisted editing: ask the Skill-Space steward to update `SKILL.md`.
- Template publishing: convert a local skill into a reusable workflow-library template.

## Template Library / 工作流库

The workflow library has three views:

- Installed: templates already installed locally.
- Cloud: templates fetched from the online catalog.
- Uploaded: templates published from this local app and removable when the local upload token exists.

Publishing performs:

- package generation
- variable extraction
- required configuration extraction
- dependency discovery for multi-skill workflows
- basic sensitive information review

## Execution Flow / 执行流程

```text
User selects skill
  -> app renders optional input form from inputs.schema.json
  -> user selects agent, defaulting to Claude Code
  -> app compiles SKILL.md + workflow + user input
  -> adapter starts CLI process
  -> stdout/stderr stream into run events
  -> waiting-for-user output pauses until user replies
  -> artifacts and summaries are collected
  -> status is normalized to completed, failed, or waiting_reply
```

## Automation / 自动化

Skill-Space supports one-time, daily, weekly, monthly, and interval schedules. On Windows, the background guard uses Task Scheduler and runs silently. Scheduler status, next run, last run, and clearable errors are shown in Settings.

## Feishu Collaboration / 飞书协同

Feishu integration supports:

- task start/completion/failure notifications
- mobile confirmation replies
- LLM steward intent routing for normal language
- card-style replies
- conservative chunking for long content
- decision logs for debugging

## Online Updates / 在线更新

The Windows app uses `electron-updater` with a generic feed:

```text
https://ailabing.cn/downloads/skill-space/latest.yml
```

The release directory must include:

```text
Skill-Space-Setup-<version>-x64.exe
Skill-Space-Setup-<version>-x64.exe.blockmap
latest.yml
```

## Current Release / 当前版本

Version `0.1.38` focuses on:

- stable updater error handling
- dismissible dashboard alerts
- clearable background scheduler errors
- cleaner Feishu confirmation messages
- workflow library and template-publishing stabilization
- full smoke-test coverage for marketplace, Feishu routing, publish safety, and run status

## Roadmap / 路线图

- Stronger multi-skill dependency bundling.
- Server-side template validation and sensitive-content scanning.
- Optional template signing or author identity.
- Richer workflow graph editor.
- Cross-platform packaging for macOS after the Windows workflow stabilizes.
- More automated UI regression tests for medium window layouts and Feishu edge cases.
