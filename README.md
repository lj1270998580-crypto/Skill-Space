# Skill-Space

> 本地优先的 SkillOps 桌面工作台，用来管理、执行和自动化 Codex、Claude Code、OpenClaw、Hermes Agent 等 AI Agent 的通用技能。
>
> A local-first SkillOps desktop workspace for managing, running, and automating universal AI-agent skills across Codex, Claude Code, OpenClaw, Hermes Agent, and compatible CLIs.

![Skill-Space Icon](resources/skill-space.png)

## 中文说明

### 项目定位

Skill-Space 是一个面向个人使用的本地桌面应用。它把 AI Agent 工作流沉淀为通用 `SKILL.md` 技能包，并同步到可视化技能库中，方便查看、分类、运行、继续对话和定时自动执行。

应用默认使用中文界面，设置中可切换英文。数据默认保存在 `D:\Skill-Space`，技能与运行历史优先留在本机，不依赖云端服务。

### 主要能力

- 技能库管理：扫描本机已有技能、手动导入技能、删除技能、查看技能文件与元数据。
- 工作流转技能：配套 `skill-space` / `Skill-Space Capture` 技能，可把已完成或用户描述的 Agent 工作流转换为通用 `SKILL.md` 技能包。
- 多 Agent 执行：支持 Claude Code、Codex CLI、OpenClaw、Hermes Agent 等执行器，技能保持通用，运行时选择执行 Agent。
- 运行控制台：查看实时日志、运行历史、运行产物，并支持对需要确认的任务继续对话。
- 自动化系统：支持一次、每天、每周、每月和间隔触发，到时间后自动执行指定技能。
- 静默后台守护：可注册 Windows 后台定时守护任务，避免反复弹出命令窗口，并在设置中展示状态。
- LLM 辅助：可生成中文技能说明、分析运行历史、给技能打单一标签，并辅助自动化策略判断。
- 本地展示名：支持为技能设置应用内显示名，便于按项目识别，不修改技能实际参数和目录名。
- 双语界面：中文默认，英文可选。
- Liquid Glass UI：Electron + React 构建，使用类苹果液态玻璃风格的半透明面板、柔和高光和动效。

### 技能包标准

Skill-Space 兼容以 `SKILL.md` 为入口的通用技能结构。推荐目录如下：

```text
my-skill/
  SKILL.md
  .skillspace/
    manifest.json
    workflow.yaml
    inputs.schema.json
    outputs.schema.json
    permissions.json
    adapters.json
  scripts/
  references/
  assets/
```

核心约定：

- `SKILL.md` 是技能说明和执行入口，所有 Agent 都应能读懂。
- `.skillspace/manifest.json` 保存名称、版本、说明、标签、更新时间等可视化元数据。
- `.skillspace/workflow.yaml` 描述工作流步骤，方便可视化、审计和迁移。
- `.skillspace/inputs.schema.json` 可生成运行前参数表单。
- `.skillspace/permissions.json` 描述网络、文件、密钥等权限。
- `.skillspace/adapters.json` 描述 Claude Code、Codex、OpenClaw、Hermes 等执行器适配信息。
- `scripts/`、`references/`、`assets/` 用于放置脚本、参考资料和素材。

### 默认本地目录

```text
D:\Skill-Space\
  skills\        应用技能库
  imports\       手动导入缓存
  runs\          运行历史与日志
  artifacts\     运行产物
  automations\   定时任务与后台守护脚本
  logs\          开发和后台日志
```

### 开发运行

环境要求：

- Windows 10/11
- Node.js 18+
- npm
- 已安装需要调用的 Agent CLI，例如 `claude`、`codex`、`openclaw`

安装依赖：

```powershell
npm install
```

启动开发版：

```powershell
npm run dev
```

类型检查：

```powershell
npm run typecheck
```

生产构建：

```powershell
npm run build
```

### 桌面快捷方式

当前快捷方式创建在：

```text
C:\Users\15119\Desktop\Skill-Space.lnk
```

快捷方式通过隐藏启动脚本打开应用，避免额外弹出命令窗口：

```text
D:\Skill-Space\launcher\Start-Skill-Space.vbs
D:\Skill-Space\launcher\Start-Skill-Space.ps1
```

图标资源：

```text
resources\skill-space-liquid.ico
resources\skill-space.ico
resources\skill-space.png
resources\skill-space-liquid-source.png
```

如果 Windows 桌面仍显示旧图标，通常是系统图标缓存导致；刷新桌面、重建快捷方式或重启 Explorer 后会更新。

### 使用流程

1. 打开应用，进入“技能”页面。
2. 点击“扫描已有技能”选择本机技能，或点击“导入”导入 `SKILL.md` 技能包。
3. 选中技能后查看说明、文件、权限、适配器和运行结果。
4. 在顶部选择执行智能体，例如 Claude Code 或 Codex。
5. 输入本次运行目标、参数或约束，点击“运行”。
6. 若技能需要确认选题、路径或下一步选择，可在运行页使用“继续对话”补充。
7. 需要长期自动执行时，在“自动化”页面创建定时任务。
8. 在“设置”中开启后台定时守护，并查看状态、下次检查和上次检查时间。

### 常见问题

**为什么技能说明是空的？**  
可以点击“生成说明”。应用会优先调用本地可用的 LLM/Claude Code，总结 `SKILL.md` 的用途；失败时使用本地规则兜底。

**技能标签为什么只有一个？**  
Skill-Space 采用单标签策略，便于筛选和归类。LLM 会根据技能内容选择最合适的一个业务标签，例如“公众号”“写作”“开发”“运维”。

**运行失败但日志有输出怎么办？**  
先查看实时日志和运行产物。如果 Agent 需要人工确认，使用“继续对话”输入选择或补充要求。

**会不会修改原技能参数？**  
应用显示名只保存在本地浏览器存储中，不会修改技能真实目录名、`SKILL.md` 或执行参数。

**后台定时守护是否静默？**  
是。后台守护脚本通过 VBS/Task Scheduler 静默执行，并在设置页显示状态。

## English

### What Is Skill-Space?

Skill-Space is a personal, local-first desktop workspace for turning reusable AI-agent workflows into portable `SKILL.md` skill packages. It helps you inspect, import, classify, run, continue, and schedule skills from one visual app.

The app defaults to Simplified Chinese and supports English in Settings. Local data is stored under `D:\Skill-Space` by default.

### Key Features

- Skill library: scan local skills, import skill folders or archives, delete skills, inspect files and metadata.
- Workflow-to-skill capture: use the bundled Skill-Space capture workflow to convert reusable Agent work into a portable skill.
- Multi-agent execution: run the same skill with Claude Code, Codex CLI, OpenClaw, Hermes Agent, or compatible CLIs.
- Interactive runs: view logs, history, artifacts, and continue conversations when a skill needs confirmation.
- Scheduling: create one-time, daily, weekly, monthly, or interval-based automations.
- Silent background scheduler: use Windows Task Scheduler with a hidden launcher and visible status in Settings.
- LLM assistance: summarize imported skills, analyze run history, classify each skill into one practical label, and reason about automation strategy.
- Local display aliases: set a human-friendly project name in the app without changing the actual skill id or parameters.
- Bilingual UI: Chinese by default, English optional.
- Liquid Glass interface: Electron + React UI with translucent panels, soft highlights, and responsive interactions.

### Skill Package Convention

Skill-Space expects a portable skill folder with `SKILL.md` as the main entrypoint:

```text
my-skill/
  SKILL.md
  .skillspace/
    manifest.json
    workflow.yaml
    inputs.schema.json
    outputs.schema.json
    permissions.json
    adapters.json
  scripts/
  references/
  assets/
```

Recommended meanings:

- `SKILL.md`: the universal instruction document that all supported agents can read.
- `.skillspace/manifest.json`: visual metadata such as name, version, description, tags, and update time.
- `.skillspace/workflow.yaml`: workflow steps for review, visualization, and portability.
- `.skillspace/inputs.schema.json`: optional schema for generating a run parameter form.
- `.skillspace/permissions.json`: declared filesystem, network, and secret access.
- `.skillspace/adapters.json`: per-agent adapter hints for Claude Code, Codex, OpenClaw, Hermes, and others.
- `scripts/`, `references/`, `assets/`: optional executable helpers, supporting documents, and media.

### Local Data Layout

```text
D:\Skill-Space\
  skills\        Installed Skill-Space skills
  imports\       Manual import cache
  runs\          Run records and logs
  artifacts\     Generated outputs
  automations\   Scheduled tasks and background scripts
  logs\          Development and scheduler logs
```

### Development

Requirements:

- Windows 10/11
- Node.js 18+
- npm
- Optional agent CLIs such as `claude`, `codex`, and `openclaw`

Install dependencies:

```powershell
npm install
```

Run in development:

```powershell
npm run dev
```

Typecheck:

```powershell
npm run typecheck
```

Build:

```powershell
npm run build
```

### Typical Workflow

1. Open Skill-Space.
2. Go to Skills.
3. Scan existing local skills or import a `SKILL.md` package.
4. Review the skill description, files, permissions, adapters, and metadata.
5. Choose an executor such as Claude Code or Codex.
6. Enter the run goal, parameters, or constraints.
7. Start the run and watch logs/artifacts.
8. Continue the conversation if the agent asks for confirmation.
9. Create an automation when the skill should run on a schedule.

### Repository Notes

This project is currently optimized for a single-user local Windows setup. The default permission mode is intentionally broad because it is designed for personal automation experiments. Before using shared machines or sensitive workspaces, review each skill's permissions and execution commands.

