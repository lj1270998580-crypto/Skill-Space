# Skill Template Library / 工作流模板库

Skill-Space 的工作流库用于把个人工作流 Skill 转换成可复用模板。上传或分享前，应用会生成一个去本机化的模板包，尽量避免把个人路径、账号、密钥和临时产物带到公共库。

The Skill-Space workflow library turns personal workflow skills into reusable templates. Before sharing, Skill-Space prepares a generic package and extracts required runtime configuration so another user can install and configure it locally.

## Flow / 流程

1. 在本地技能库选择一个已经跑通的 Skill。
2. 点击“加入工作流库”，应用会复制技能文件到本地模板包目录。
3. 发布处理器扫描 `SKILL.md`、脚本和元数据，提取路径、密钥引用和文本变量。
4. 生成 `.skillspace/publish.json` 与 `.skillspace/inputs.schema.json`。
5. 本地工作流库会出现该模板，可删除、安装测试或生成分享包。
6. 在线库通过 `catalog.json` 提供远端模板列表；应用点击“刷新在线库”后联网读取。

## Runtime Configuration / 运行配置

模板安装时不会要求用户填写安装路径。路径变量由 Skill-Space 自动指向本地技能库目录。用户只需要填写真正影响工作流运行的配置，例如：

- API Key 或密钥引用
- 账号名称、发布渠道、业务目标
- 需要连接的服务、站点、Webhook 或数据源
- 输出格式、语言、风格、审核规则

Variables use these placeholder formats:

```text
{{path.workspace_path}}
{{secret.api_key}}
{{text.project_name}}
```

## Catalog Format / 在线目录格式

The online catalog is a JSON document hosted at:

```text
https://ailabing.cn/downloads/skill-space/templates/catalog.json
```

Example:

```json
{
  "schemaVersion": "skillspace.marketplace.catalog.v1",
  "generatedAt": "2026-05-22T08:00:00.000Z",
  "templates": [
    {
      "id": "wechat-daily-article",
      "name": "公众号每日文章自动化",
      "description": "从选题确认、深度文章生成到 md2wechat 草稿同步的通用发布模板。",
      "version": "1.0.0",
      "author": "Skill-Space",
      "category": "公众号",
      "downloads": 1280,
      "rating": 4.8,
      "runtimes": ["claude", "codex"],
      "requiredVariables": [],
      "safetyStatus": "ready",
      "source": "remote",
      "updatedAt": "2026-05-22T08:00:00.000Z"
    }
  ]
}
```

## Current Support / 当前支持

- Online refresh: app reads the remote `catalog.json`.
- Install status: templates show whether a matching local Skill is installed.
- Local publish: local Skill -> reusable template package -> local workflow library.
- Local delete: local templates can be removed from the workflow library.
- Share package: a local or selected template can be exported as an upload-ready package.

## Roadmap / 后续

- Public upload API with account authentication.
- Server-side package validation, sensitive-content scanning, and review queues.
- Versioned template downloads instead of metadata-only remote install.
- Ratings, download counts, author pages, and rollback history.
