---
name: skill-space
description: 将 Codex、Claude Code、OpenClaw 或 Hermes Agent 中可复用的工作流创建、发布、同步或导入为 Skill-Space 通用技能，并交给本地 Skill-Space 桌面应用管理。
---

# Skill-Space

使用这个技能，把可复用 AI Agent 工作流转换成可迁移的 `SKILL.md` 技能包，并同步到本地 Skill-Space 桌面应用。

## 本地注册表

默认数据目录：

```text
D:\Skill-Space
```

发布后的技能目录：

```text
D:\Skill-Space\skills\<skill-name>
```

## 技能包标准

保持兼容通用 `SKILL.md` 规范：

```text
skill-name\
  SKILL.md
  scripts\
  references\
  assets\
  agents\
    openai.yaml
  .skillspace\
    manifest.json
    workflow.yaml
    inputs.schema.json
    outputs.schema.json
    permissions.json
    adapters.json
```

只有 `SKILL.md` 是便携技能的必需文件。Skill-Space 专用元数据统一放到 `.skillspace/`。

`SKILL.md` 必须包含 YAML frontmatter，并至少写入 `name` 和 `description`。说明要简洁，聚焦可复用流程，不写一次性上下文。

## 工作流

当用户要求创建、发布、同步或导入 Skill-Space 技能时：

1. 识别可复用工作流的目标、触发条件、输入、输出、工具、命令、文件和验证步骤。
2. 将技能名规范化为小写字母、数字和连字符。
3. 创建 `D:\Skill-Space\skills\<skill-name>`。
4. 编写便携的 `SKILL.md`。
5. 添加 `.skillspace/manifest.json`，支持 `claude`、`hermes`、`openclaw` 和 `codex`，默认执行器为 `claude`。
6. 添加 `.skillspace/workflow.yaml`，用于可视化执行图。
7. 工作流有结构化参数时，添加输入和输出 JSON Schema。
8. 添加 `.skillspace/permissions.json`，默认 `full` 权限，除非用户明确要求限制。
9. 返回技能路径、生成文件、默认执行器、支持的执行器，以及需要用户复核的信息。

## 语言

保留原工作流语言，除非用户要求翻译。这个用户的 Skill-Space 应用默认中文展示；代码、命令、路径和 schema key 不翻译。

