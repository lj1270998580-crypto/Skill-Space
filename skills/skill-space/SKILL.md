---
name: skill-space
description: 将 Codex、Claude Code、OpenClaw 或 Hermes Agent 中可复用的工作流捕获、创建、发布、上传、安装或同步为 Skill-Space 通用技能，并交给本地 Skill-Space 桌面应用管理。
version: 1.0.0
license: MIT
metadata.hermes.tags: []
---

# Skill-Space

使用这个技能，把可复用 AI Agent 工作流转换成可迁移、可配置、可跨设备安装的 `SKILL.md` 技能包，并同步到 Skill-Space 桌面应用。

`skill-space` 是唯一权威入口。旧的 `skill-space-capture` 已合并到本技能，只作为兼容别名。

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
    bundled-skills\
      <dependency-skill>\
        SKILL.md
        scripts\
        references\
        assets\
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
    dependencies.json
    requirements.json
```

只有 `SKILL.md` 是通用技能的必需文件。Skill-Space 专用元数据统一放到 `.skillspace/`。

`SKILL.md` 必须包含 YAML frontmatter，并至少写入 `name` 和 `description`。说明要简洁，聚焦可复用流程，不写一次性上下文。

## 工作流捕获

当用户要求创建、捕获、发布、同步、上传或导入 Skill-Space 技能时：

1. 识别可复用工作流的目标、触发条件、输入、输出、工具、命令、文件和验证步骤。
2. 将技能名规范化为小写字母、数字和连字符。
3. 创建 `D:\Skill-Space\skills\<skill-name>`。
4. 编写便携的 `SKILL.md`，保留原工作流语言，除非用户要求翻译。
5. 添加 `.skillspace/manifest.json`，支持 `claude`、`hermes`、`openclaw` 和 `codex`，默认执行器为 `claude`。
6. 添加 `.skillspace/workflow.yaml`，用于可视化执行图。
7. 工作流有结构化参数时，添加 `.skillspace/inputs.schema.json` 和 `.skillspace/outputs.schema.json`。
8. 添加 `.skillspace/permissions.json`，默认 `full` 权限，除非用户明确要求限制。
9. 返回技能路径、生成文件、默认执行器、支持的执行器，以及需要用户复核的信息。

## 依赖合并

如果工作流调用了其他 skill，不要只写“调用某某 skill”的指令。必须把依赖 skill 一起纳入模板包：

1. 识别主流程、脚本、参考文档和用户描述中引用的所有子 skill。
2. 递归检查子 skill 是否继续引用其他 skill，默认至少处理两层依赖。
3. 将可迁移的子 skill 完整复制到 `references/bundled-skills/<dependency-skill>/`。
4. 保留子 skill 的 `SKILL.md`、`scripts/`、`references/`、`assets/` 和必要的 `.skillspace/` 元数据。
5. 在 `.skillspace/dependencies.json` 写入依赖列表、版本、用途和打包路径。
6. 在主 `SKILL.md` 中说明：如果本机缺少依赖，Skill-Space 安装模板时会自动安装 bundled skill。

不要打包用户私密数据、账号、密钥、cookie、token、机器专属绝对路径或一次性运行产物。

## 配置抽取

模板必须把跨设备运行所需配置抽取为变量，而不是保留本机值：

```text
{{text.brand_name}}
{{secret.api_key}}
{{path.output_dir}}
{{service.feishu_app_id}}
```

需要进入 `.skillspace/inputs.schema.json` 或 `.skillspace/requirements.json` 的内容包括：

- API Key、token、secret、password
- 飞书、微信、GitHub、阿里云等服务配置
- 本地目录、输出路径、素材目录
- 需要安装的 CLI 工具，例如 `node`、`python`、`md2wechat`、`docker`
- 需要用户确认的业务参数，例如公众号名称、选题方向、发布账号

`.skillspace/requirements.json` 用来说明模板运行前必须具备的外部条件；`.skillspace/inputs.schema.json` 用来生成安装配置表单。

## 上传前检查

上传到工作流库前必须确认：

1. 模板不含真实密钥、个人目录、账号凭证或硬编码机器路径。
2. 所有被调用的子 skill 已在 `references/bundled-skills/` 中，或在 `requirements.json` 中明确说明需要用户自行安装。
3. 安装配置项能覆盖运行所需 API、服务、路径和业务参数。
4. 模板在缺少原电脑环境时仍能通过“安装配置 + bundled dependencies”恢复可运行状态。

## 语言

这个用户的 Skill-Space 应用默认中文展示；代码、命令、路径和 schema key 不翻译。
