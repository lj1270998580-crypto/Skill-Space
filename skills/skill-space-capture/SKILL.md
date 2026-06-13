---
name: skill-space-capture
description: 兼容入口：工作流捕获能力已合并到 skill-space。收到捕获、转换或发布工作流请求时，请转交 skill-space 执行。
version: 1.0.0
license: MIT
metadata.hermes.tags: []
---

# Skill-Space Capture

此技能已合并到 `skill-space`。

当用户要求捕获、转换、创建、发布、上传或同步可复用工作流时，请使用 `skill-space` 的完整流程，包括：

- 生成通用 `SKILL.md`
- 收集并内嵌被调用的子 skill
- 抽取 API、路径、服务和业务参数配置
- 生成 `.skillspace/dependencies.json`
- 生成 `.skillspace/requirements.json`
- 同步到 Skill-Space 本地技能库或工作流库

不要再维护独立的捕获规范；以 `skill-space` 为唯一权威标准。
