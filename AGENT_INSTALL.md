# Agent Install Guide / Agent 安装指南

This guide is written for AI agents or technical users who receive the repository URL and need to install Skill-Space plus its bundled skills on a Windows machine.

本指南面向 AI Agent 或技术用户：当你把 GitHub 地址交给 Agent 后，它可以按这里的步骤安装 Skill-Space 应用和配套技能。

## Quick Install / 快速安装

```powershell
git clone https://github.com/lj1270998580-crypto/Skill-Space.git D:\Skill-Space\source\Skill-Space
cd D:\Skill-Space\source\Skill-Space
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-from-github.ps1 -RepoUrl https://github.com/lj1270998580-crypto/Skill-Space.git
```

The script will:

- Install npm dependencies.
- Build the Windows `.exe` installer.
- Run the installer silently by default.
- Install the bundled `skill-space` skill and compatibility alias `skill-space-capture` into common agent skill roots.
- If WSL is available, try installing skills into common WSL agent skill roots.

脚本会执行：

- 安装 npm 依赖。
- 生成 Windows `.exe` 安装包。
- 默认静默运行安装包。
- 将内置 `skill-space` 技能和兼容别名 `skill-space-capture` 安装到常见 Agent 技能目录。
- 如果检测到 WSL，也会尝试安装到 WSL 内的常见技能目录。

## Installed Skill Roots / 技能安装位置

Windows:

```text
D:\Skill-Space\skills
%USERPROFILE%\.codex\skills
%USERPROFILE%\.agents\skills
%USERPROFILE%\.claude\skills
%USERPROFILE%\.openclaw\skills
```

WSL, when available:

```text
~/.codex/skills
~/.agents/skills
~/.claude/skills
~/.openclaw/skills
~/.hermes/skills
```

## Useful Flags / 常用参数

```powershell
# Build installer and install skills, but do not run the installer.
powershell -File .\scripts\install-from-github.ps1 -SkipInstaller

# Run the installer interactively instead of silently.
powershell -File .\scripts\install-from-github.ps1 -InteractiveInstaller

# Skip WSL skill installation.
powershell -File .\scripts\install-from-github.ps1 -SkipWslSkills

# Choose a custom data root.
powershell -File .\scripts\install-from-github.ps1 -DataRoot D:\Skill-Space
```

## Expected Output / 预期产物

The generated installer is placed under:

```text
release\Skill-Space-Setup-<version>-x64.exe
```

For version `0.1.38`, the expected installer is:

```text
release\Skill-Space-Setup-0.1.38-x64.exe
```

## Verification / 验证

After installation, an agent should verify:

```powershell
npm run typecheck
npm run test:all
```

Then check that the desktop app can launch:

```powershell
Start-Process "$env:LOCALAPPDATA\Programs\Skill-Space\Skill-Space.exe"
```

安装后，建议确认：

- Skill-Space 可以正常打开。
- 技能库能看到内置 `skill-space` 技能。
- Claude Code、Codex、OpenClaw、Hermes Agent 等执行器状态能在“智能体”页面显示。
- 设置页可以修改本地存储路径、后台定时守护、LLM 管家和飞书配置。

## Notes / 注意事项

- The app is currently packaged for Windows 10/11 x64.
- Skill packages remain compatible with the common `SKILL.md` convention.
- Skill-Space-specific metadata lives under `.skillspace/`.
- Do not upload private paths, tokens, account names, or business secrets into the public workflow library without template sanitization.

- 当前安装包面向 Windows 10/11 x64。
- 技能包保持兼容通用 `SKILL.md` 规范。
- Skill-Space 扩展元数据存放在 `.skillspace/` 下。
- 上传到公共工作流库前，必须先完成模板化和敏感信息审计。
