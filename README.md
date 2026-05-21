# Skill-Space

> 本地优先的 SkillOps 桌面工作台。把 Codex、Claude Code、OpenClaw、Hermes Agent 等 AI Agent 中可复用的工作流沉淀为通用 `SKILL.md` 技能，并统一管理、运行、对话、定时和移动端协同。
>
> A local-first SkillOps desktop workspace for turning reusable AI-agent workflows into portable `SKILL.md` skills, then managing, running, continuing, scheduling, and coordinating them visually.

<p align="center">
  <img src="resources/skill-space.png" alt="Skill-Space liquid glass app icon" width="152" />
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.10-5ed8cf" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%2010%2F11-86e4d8" />
  <img alt="Runtime" src="https://img.shields.io/badge/runtime-Electron%20%2B%20React-cfd9ff" />
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-e8d28d" />
</p>

<p align="center">
  <a href="https://github.com/lj1270998580-crypto/Skill-Space/releases/latest">Windows 安装包 / Windows Installer</a>
  ·
  <a href="AGENT_INSTALL.md">Agent 安装指南 / Agent Install Guide</a>
  ·
  <a href="docs/skill-space-blueprint.md">产品蓝图 / Blueprint</a>
</p>

---

## 中文

### 当前版本

- 最新版本：`0.1.10`
- GitHub Release：<https://github.com/lj1270998580-crypto/Skill-Space/releases/tag/v0.1.10>
- Windows 安装包：<https://github.com/lj1270998580-crypto/Skill-Space/releases/download/v0.1.10/Skill-Space-Setup-0.1.10-x64.exe>
- 在线更新源：<https://ailabing.cn/downloads/skill-space/latest.yml>
- 默认执行器：Claude Code
- 默认权限模式：个人本地使用，`full`

### 0.1.10 更新重点

- 修复在线更新版本比较逻辑，旧版本不会再被误判为新版本。
- 优化智能体、技能库和设置页的窗口适配，减少窄宽度下的组件挤压。
- 设置页支持修改本地存储根目录，并尝试迁移原有技能、运行记录、日志和配置。
- 智能体配置支持命令、参数、工作目录和环境变量，减少硬编码路径。
- 后台定时守护增加错误记录和界面告警，避免静默失败。
- 增加运行目录和技能目录的路径安全校验。
- 继续保留 LLM 管家、飞书协同、在线更新、技能编辑和定时自动化能力。

### 核心能力

| 模块 | 能力 |
| --- | --- |
| 总览 | 查看本地技能工作台、最近技能，并和 LLM 管家连续对话 |
| 技能库 | 扫描电脑已有技能、手动导入、收藏、搜索、单标签分类 |
| 技能详情 | 查看 `SKILL.md`、workflow、权限、适配器、最近变更和运行入口 |
| LLM 修改技能 | 在 `SKILL.md` 下方让 LLM 管家按要求修改技能说明和流程 |
| 多 Agent 执行 | 支持 Claude Code、Codex CLI、OpenClaw、Hermes Agent 等执行器 |
| 运行控制台 | 查看实时日志、运行历史、运行产物，并支持 Claude Code 继续对话 |
| 自动化 | 支持一次、每天、每周、每月和间隔触发 |
| 后台守护 | 通过 Windows Task Scheduler 静默检查到期任务，并在 UI 显示状态和错误 |
| 飞书通信 | 接收运行状态、远程发送任务、回复确认选项，并可接入 LLM 管家理解意图 |
| 在线更新 | 从 `ailabing.cn` 的通用更新源检查、下载和安装新版 |

### 工作流

```mermaid
flowchart TD
  A["在 Codex / Claude Code / OpenClaw / Hermes 中跑通工作流"] --> B{"值得复用吗？"}
  B -- "是" --> C["用 skill-space-capture 生成 SKILL.md 技能包"]
  B -- "已有技能" --> D["扫描本机技能或手动导入"]
  C --> E["同步到 Skill-Space 技能库"]
  D --> E
  E --> F["查看说明、权限、参数和适配器"]
  F --> G["选择执行器并运行"]
  G --> H["实时日志、继续对话、产物和历史记录"]
  H --> I{"需要长期重复执行？"}
  I -- "需要" --> J["创建定时自动化"]
  J --> K["后台守护触发，并通过飞书通知或等待确认"]
  I -- "不需要" --> L["保留为可复用技能"]
```

### 安装

#### 普通用户

1. 打开 [GitHub Releases](https://github.com/lj1270998580-crypto/Skill-Space/releases/latest)。
2. 下载 `Skill-Space-Setup-0.1.10-x64.exe`。
3. 运行安装包，安装完成后从桌面或开始菜单打开 Skill-Space。

#### Agent 自动安装

把仓库地址交给 Agent：

```text
https://github.com/lj1270998580-crypto/Skill-Space
```

Agent 可参考 [AGENT_INSTALL.md](AGENT_INSTALL.md) 完成源码构建、安装包安装和内置技能同步。

### 本地存储

Skill-Space 默认优先使用本机数据目录。你可以在设置页修改本地存储根目录。保存后，应用会尝试把旧目录中的技能、运行记录、日志、自动化和配置迁移到新目录。

典型目录结构：

```text
Skill-Space/
  skills/
  runs/
  logs/
  artifacts/
  automations/
  registry/
  config/
```

### 开发

```powershell
git clone https://github.com/lj1270998580-crypto/Skill-Space.git
cd Skill-Space
npm install
npm run dev
```

常用命令：

```powershell
npm run typecheck
npm run build
npm run dist:win
```

### 发布

Windows 安装包和在线更新文件由 `electron-builder` 生成：

```text
release/Skill-Space-Setup-0.1.10-x64.exe
release/Skill-Space-Setup-0.1.10-x64.exe.blockmap
release/latest.yml
```

在线更新源目录：

```text
https://ailabing.cn/downloads/skill-space/
```

---

## English

### Current Version

- Latest version: `0.1.10`
- GitHub Release: <https://github.com/lj1270998580-crypto/Skill-Space/releases/tag/v0.1.10>
- Windows installer: <https://github.com/lj1270998580-crypto/Skill-Space/releases/download/v0.1.10/Skill-Space-Setup-0.1.10-x64.exe>
- Auto-update feed: <https://ailabing.cn/downloads/skill-space/latest.yml>
- Default runner: Claude Code
- Default permission mode: local personal use, `full`

### What's New In 0.1.10

- Fixed online update version comparison so older builds are ignored correctly.
- Improved responsive layouts for agent settings, skill cards, and settings panels.
- Added configurable local storage root with best-effort data migration.
- Added editable agent command, args, working directory, and environment variables.
- Added scheduler error recording and visible UI warnings.
- Added path safety checks for run and skill file operations.
- Kept LLM steward, Feishu collaboration, online updates, skill editing, and scheduled automation.

### Features

| Area | Capability |
| --- | --- |
| Dashboard | Local SkillOps overview, recent skills, and persistent LLM steward chat |
| Skills | Scan local skills, import packages, search, favorite, and classify by one tag |
| Details | Inspect `SKILL.md`, workflow, schemas, permissions, adapters, and recent changes |
| LLM Skill Editing | Ask the steward to revise the selected `SKILL.md` directly |
| Multi-Agent Runtime | Run skills with Claude Code, Codex CLI, OpenClaw, Hermes Agent, or compatible runners |
| Run Console | Live logs, run history, artifacts, and Claude Code follow-up conversations |
| Automation | One-time, daily, weekly, monthly, and interval schedules |
| Background Scheduler | Silent Windows Task Scheduler integration with visible status and error reporting |
| Feishu Messaging | Mobile notifications, remote task commands, confirmation replies, and LLM intent routing |
| Online Updates | Generic update feed hosted on `ailabing.cn` |

### Install

1. Open [GitHub Releases](https://github.com/lj1270998580-crypto/Skill-Space/releases/latest).
2. Download `Skill-Space-Setup-0.1.10-x64.exe`.
3. Run the installer and launch Skill-Space from the desktop or Start Menu.

### Development

```powershell
git clone https://github.com/lj1270998580-crypto/Skill-Space.git
cd Skill-Space
npm install
npm run dev
```

Build and package:

```powershell
npm run typecheck
npm run build
npm run dist:win
```

## License

Apache-2.0. See [LICENSE](LICENSE).
