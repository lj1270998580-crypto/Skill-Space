# Agent Install Guide / Agent 安装指南

## 中文

当你把 GitHub 地址交给一个 Agent 时，让它执行下面流程即可安装 Skill-Space 应用和配套技能：

```powershell
git clone https://github.com/lj1270998580-crypto/Skill-Space.git D:\Skill-Space\source\Skill-Space
cd D:\Skill-Space\source\Skill-Space
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-from-github.ps1 -RepoUrl https://github.com/lj1270998580-crypto/Skill-Space.git
```

脚本会执行：

- 安装 npm 依赖。
- 生成 Windows `.exe` 安装包。
- 静默运行安装包。
- 将 `skill-space` 技能和兼容别名 `skill-space-capture` 安装到：
  - `D:\Skill-Space\skills`
  - `%USERPROFILE%\.codex\skills`
  - `%USERPROFILE%\.agents\skills`
  - `%USERPROFILE%\.claude\skills`
  - `%USERPROFILE%\.openclaw\skills`
- 如果本机有 WSL，也会尝试安装到默认 WSL 发行版中的：
  - `~/.codex/skills`
  - `~/.agents/skills`
  - `~/.claude/skills`
  - `~/.openclaw/skills`
  - `~/.hermes/skills`

可选参数：

```powershell
# 只生成安装包和安装技能，不运行安装器
powershell -File .\scripts\install-from-github.ps1 -SkipInstaller

# 使用交互式安装器，不静默安装
powershell -File .\scripts\install-from-github.ps1 -InteractiveInstaller

# 跳过 WSL 技能安装
powershell -File .\scripts\install-from-github.ps1 -SkipWslSkills

# 指定数据目录
powershell -File .\scripts\install-from-github.ps1 -DataRoot D:\Skill-Space
```

生成的安装包默认位于：

```text
release\Skill-Space-Setup-<version>-x64.exe
```

## English

When an agent receives the GitHub URL, ask it to run:

```powershell
git clone https://github.com/lj1270998580-crypto/Skill-Space.git D:\Skill-Space\source\Skill-Space
cd D:\Skill-Space\source\Skill-Space
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-from-github.ps1 -RepoUrl https://github.com/lj1270998580-crypto/Skill-Space.git
```

The script will:

- Install npm dependencies.
- Build the Windows `.exe` installer.
- Run the installer silently.
- Install the bundled `skill-space` skill and its compatibility alias `skill-space-capture` into common Windows agent skill roots.
- If WSL is available, also try installing the skills into common WSL agent skill roots.

Useful flags:

```powershell
# Build installer and install skills, but do not run the installer
powershell -File .\scripts\install-from-github.ps1 -SkipInstaller

# Run the installer interactively instead of silently
powershell -File .\scripts\install-from-github.ps1 -InteractiveInstaller

# Skip WSL skill installation
powershell -File .\scripts\install-from-github.ps1 -SkipWslSkills

# Choose a custom data root
powershell -File .\scripts\install-from-github.ps1 -DataRoot D:\Skill-Space
```

The generated installer is placed under:

```text
release\Skill-Space-Setup-<version>-x64.exe
```
