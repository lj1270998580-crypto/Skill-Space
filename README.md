# Skill-Space

> 本地优先的 SkillOps 桌面工作台。把 Codex、Claude Code、OpenClaw、Hermes Agent 等 AI Agent 中可复用的工作流沉淀为通用 `SKILL.md` 技能，并统一管理、运行、对话和定时自动化。
>
> A local-first SkillOps desktop workspace for turning reusable AI-agent workflows into portable `SKILL.md` skills, then managing, running, continuing, and scheduling them from one visual app.

<p align="center">
  <img src="resources/skill-space.png" alt="Skill-Space liquid glass app icon" width="160" />
</p>

<p align="center">
  <a href="https://github.com/lj1270998580-crypto/Skill-Space/releases/tag/v0.1.0">Windows 安装包 / Windows Installer</a>
  ·
  <a href="AGENT_INSTALL.md">Agent 安装指南 / Agent Install Guide</a>
  ·
  <a href="docs/skill-space-blueprint.md">产品蓝图 / Blueprint</a>
</p>

---

## 中文

### 简介

Skill-Space 是一个面向个人自动化工作流的本地桌面应用。它解决的问题很简单：当你在 Codex、Claude Code、OpenClaw、Hermes Agent 或其他 Agent 中完成了一套可复用流程后，可以把它保存成一个通用技能包，再通过 Skill-Space 查看、分类、运行、继续对话和定时触发。

应用默认使用中文界面，设置中支持切换英文。默认数据目录为 `D:\Skill-Space`，技能、运行历史、日志和产物都优先保存在本机。

### 当前状态

- 平台：Windows 10/11
- 应用形态：Electron 桌面应用
- 版本：`0.1.0`
- 默认数据目录：`D:\Skill-Space`
- 默认执行器：Claude Code
- 权限模式：个人本地使用，默认 `full`
- 安装包：[`Skill-Space-Setup-0.1.0-x64.exe`](https://github.com/lj1270998580-crypto/Skill-Space/releases/download/v0.1.0/Skill-Space-Setup-0.1.0-x64.exe)

### 核心功能

| 模块 | 能力 |
| --- | --- |
| 技能库 | 扫描电脑上的已有技能，手动导入技能，查看 `SKILL.md`、元数据、权限和适配器 |
| 工作流捕获 | 使用内置 `skill-space` / `skill-space-capture` 技能，把可复用工作流生成新技能 |
| 多 Agent 执行 | 支持 Claude Code、Codex CLI、OpenClaw、Hermes Agent 等执行器 |
| 运行控制台 | 查看实时日志、运行历史、运行产物，并支持继续对话 |
| 自动化 | 支持一次、每天、每周、每月和间隔触发 |
| 后台守护 | 通过 Windows Task Scheduler 静默检查定时任务，避免弹出命令窗口 |
| LLM 辅助 | 自动总结技能说明、分析运行历史、生成单标签分类和自动化建议 |
| 应用显示名 | 支持给技能设置本地显示名，方便按项目识别，不修改技能真实参数 |
| 双语界面 | 默认中文，设置中可切换英文 |
| Liquid Glass UI | 类苹果液态玻璃视觉风格，支持深色/浅色主题 |

### 安装方式

#### 方式一：下载 Windows 安装包

从 Release 下载并安装：

```text
https://github.com/lj1270998580-crypto/Skill-Space/releases/tag/v0.1.0
```

安装后会创建：

- 应用目录：`%LOCALAPPDATA%\Programs\Skill-Space`
- 桌面快捷方式：`Skill-Space.lnk`
- 开始菜单快捷方式：`Skill-Space`
- 卸载入口：`Skill-Space 0.1.0`

#### 方式二：让 Agent 通过 GitHub 地址安装

把仓库地址交给 Agent，并让它执行：

```powershell
git clone https://github.com/lj1270998580-crypto/Skill-Space.git D:\Skill-Space\source\Skill-Space
cd D:\Skill-Space\source\Skill-Space
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-from-github.ps1 -RepoUrl https://github.com/lj1270998580-crypto/Skill-Space.git
```

脚本会：

- 安装 npm 依赖；
- 生成 Windows `.exe` 安装包；
- 可选静默安装应用；
- 安装内置技能 `skill-space` 和 `skill-space-capture`；
- 将技能同步到常见 Agent 技能目录；
- 如果 WSL 可用，尝试同步到 WSL 内的常见技能目录。

更多参数见 [AGENT_INSTALL.md](AGENT_INSTALL.md)。

### 内置技能

仓库内置两个 Skill-Space 相关技能：

| 技能 | 用途 |
| --- | --- |
| `skill-space` | 将 Codex、Claude Code、OpenClaw、Hermes Agent 中的可复用工作流发布到 Skill-Space |
| `skill-space-capture` | 将已完成或用户描述的工作流转换为便携 `SKILL.md` 技能包 |

安装脚本会把它们复制到：

```text
D:\Skill-Space\skills
%USERPROFILE%\.codex\skills
%USERPROFILE%\.agents\skills
%USERPROFILE%\.claude\skills
%USERPROFILE%\.openclaw\skills
```

如果 WSL 可用，也会尝试复制到：

```text
~/.codex/skills
~/.agents/skills
~/.claude/skills
~/.openclaw/skills
~/.hermes/skills
```

### 技能包规范

Skill-Space 兼容以 `SKILL.md` 为入口的通用技能包。推荐结构：

```text
my-skill/
  SKILL.md
  scripts/
  references/
  assets/
  agents/
    openai.yaml
  .skillspace/
    manifest.json
    workflow.yaml
    inputs.schema.json
    outputs.schema.json
    permissions.json
    adapters.json
```

文件说明：

| 文件 | 说明 |
| --- | --- |
| `SKILL.md` | 通用技能说明和执行入口，所有 Agent 都应能读取 |
| `.skillspace/manifest.json` | 名称、版本、说明、标签、默认执行器等可视化元数据 |
| `.skillspace/workflow.yaml` | 工作流节点和边，用于审计、可视化和迁移 |
| `.skillspace/inputs.schema.json` | 可选输入参数表单 |
| `.skillspace/outputs.schema.json` | 可选输出结构说明 |
| `.skillspace/permissions.json` | 文件、网络、密钥等权限声明 |
| `.skillspace/adapters.json` | Claude Code、Codex、OpenClaw、Hermes 等执行器适配信息 |

### 本地数据目录

默认数据根目录：

```text
D:\Skill-Space\
  skills\        技能库
  imports\       导入缓存
  runs\          运行历史和日志
  artifacts\     运行产物
  automations\   定时任务和后台守护脚本
  logs\          应用日志
  config\        本地配置
  registry\      注册表和索引
```

### 使用流程

1. 打开 Skill-Space。
2. 进入“技能”页面，扫描已有技能或手动导入技能包。
3. 查看技能说明、文件、权限、适配器和元数据。
4. 在顶部选择执行器，例如 Claude Code 或 Codex。
5. 输入运行目标、参数或约束，点击“运行”。
6. 如果 Agent 需要确认选题或下一步，在“继续对话”中补充。
7. 查看实时日志和运行产物。
8. 对需要长期执行的技能，在“自动化”页面创建定时任务。
9. 在“设置”中开启后台定时守护，并查看守护状态。

### 开发

环境要求：

- Windows 10/11
- Node.js 18+
- npm
- 可选：`claude`、`codex`、`openclaw`、Hermes Agent 等 CLI

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

生成 Windows 安装包：

```powershell
npm run dist:win
```

安装包输出：

```text
release\Skill-Space-Setup-0.1.0-x64.exe
```

> 打包配置会优先使用本地 `node_modules\electron\dist`，减少 Electron 下载缓存损坏导致的构建失败。

### 项目结构

```text
.
├─ src/
│  ├─ main/          Electron 主进程、本地文件、调度器、CLI 适配
│  ├─ preload/       安全 IPC 桥
│  ├─ renderer/      React 前端界面
│  └─ shared/        共享 TypeScript 类型
├─ skills/           内置 Skill-Space 技能
├─ scripts/          安装和测试脚本
├─ resources/        图标和应用资源
├─ docs/             产品蓝图和设计文档
└─ release/          本地生成的安装包
```

### 常见问题

**这是本地应用还是云应用？**  
这是本地优先应用。默认数据放在 `D:\Skill-Space`，不会依赖云端数据库。

**安装包是否已经包含技能？**  
包含。安装包内置 `skill-space` 和 `skill-space-capture`，安装脚本也会把它们同步到常见 Agent 技能目录。

**为什么运行技能时还需要 Claude Code 或 Codex？**  
Skill-Space 是技能管理和调度层，实际执行仍由你选择的 Agent CLI 完成。

**是否支持需要确认步骤的技能？**  
支持。运行页提供“继续对话”，可以把选题、确认、补充参数继续发给 Agent。

**是否会修改技能真实名称？**  
不会。应用显示名只用于本地识别，不改变技能目录名、`SKILL.md` 或执行参数。

---

## English

### Overview

Skill-Space is a local-first desktop app for personal AI workflow automation. It turns reusable work done in Codex, Claude Code, OpenClaw, Hermes Agent, or compatible CLIs into portable `SKILL.md` packages, then provides a visual workspace for managing, running, continuing, and scheduling those skills.

The UI defaults to Simplified Chinese and can be switched to English in Settings. Local data is stored under `D:\Skill-Space` by default.

### Highlights

| Area | Capability |
| --- | --- |
| Skill Library | Scan local skills, import packages, inspect `SKILL.md`, metadata, permissions, and adapters |
| Workflow Capture | Convert reusable agent workflows into portable skills |
| Multi-Agent Runs | Run the same skill with Claude Code, Codex CLI, OpenClaw, Hermes Agent, or compatible CLIs |
| Run Console | View live logs, history, artifacts, and continue interactive runs |
| Automation | Schedule one-time, daily, weekly, monthly, or interval-based runs |
| Background Scheduler | Use Windows Task Scheduler silently without command-window popups |
| LLM Assistance | Summarize skills, analyze runs, classify skills, and suggest automation strategies |
| Local Aliases | Give a skill a local display name without changing its real id or parameters |
| Bilingual UI | Chinese by default, English optional |
| Liquid Glass UI | Electron + React interface with translucent panels and light/dark themes |

### Installation

Download the Windows installer:

```text
https://github.com/lj1270998580-crypto/Skill-Space/releases/tag/v0.1.0
```

Direct asset:

```text
https://github.com/lj1270998580-crypto/Skill-Space/releases/download/v0.1.0/Skill-Space-Setup-0.1.0-x64.exe
```

Installed app location:

```text
%LOCALAPPDATA%\Programs\Skill-Space
```

### Agent Installation From GitHub

Give an agent the repository URL and ask it to run:

```powershell
git clone https://github.com/lj1270998580-crypto/Skill-Space.git D:\Skill-Space\source\Skill-Space
cd D:\Skill-Space\source\Skill-Space
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-from-github.ps1 -RepoUrl https://github.com/lj1270998580-crypto/Skill-Space.git
```

The script installs dependencies, builds the Windows installer, optionally runs it, and installs the bundled `skill-space` and `skill-space-capture` skills into common agent skill roots.

See [AGENT_INSTALL.md](AGENT_INSTALL.md) for details.

### Skill Package Convention

Recommended package layout:

```text
my-skill/
  SKILL.md
  scripts/
  references/
  assets/
  agents/
    openai.yaml
  .skillspace/
    manifest.json
    workflow.yaml
    inputs.schema.json
    outputs.schema.json
    permissions.json
    adapters.json
```

`SKILL.md` is the portable entrypoint. Skill-Space-specific metadata lives under `.skillspace/`.

### Development

Install dependencies:

```powershell
npm install
```

Run the development app:

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

Build the Windows installer:

```powershell
npm run dist:win
```

### Notes

Skill-Space is currently optimized for a single-user local Windows environment. The default permission mode is intentionally broad for personal automation experiments. Review each skill's permission and execution commands before using it on shared or sensitive machines.

