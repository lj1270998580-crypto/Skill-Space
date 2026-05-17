---
name: skill-space-capture
description: 将已完成或用户描述的 AI Agent 工作流转换为可迁移的 SKILL.md 技能包，并补充 Skill-Space 可视化元数据。
---

# Skill-Space 工作流捕获

使用这个技能，把可复用工作流沉淀成一个通用技能包。

## 本地入库规则

默认把新技能创建到：

```text
D:\Skill-Space\skills\<skill-name>
```

完成后必须返回技能目录。Skill-Space 桌面应用会扫描这个目录，并在运行结束后自动刷新技能库。

## 工作流

1. 识别工作流目标、触发条件、必要输入、期望输出、工具、文件、命令和验证步骤。
2. 编写简洁的 `SKILL.md`，YAML frontmatter 必须包含 `name` 和 `description`。
3. 保持通用 Skill 标准优先：面向 Agent 的资源只使用 `SKILL.md`、`scripts/`、`references/`、`assets/` 和 `agents/openai.yaml`。
4. 将 Skill-Space 使用的元数据统一放到 `.skillspace/`。
5. 生成 `.skillspace/manifest.json`、`.skillspace/workflow.yaml`、`.skillspace/inputs.schema.json`、`.skillspace/outputs.schema.json`、`.skillspace/permissions.json` 和 `.skillspace/adapters.json`。
6. 默认使用 `full` 权限，除非用户明确要求限制权限。
7. 保留原工作流语言，除非用户要求翻译。

## 输出

返回已创建的技能目录、生成文件、默认执行器、支持的执行器，以及需要用户复核的缺失信息。

