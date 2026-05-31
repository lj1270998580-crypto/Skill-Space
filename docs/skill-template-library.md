# Skill Template Library / 工作流模板库

The Skill-Space workflow library turns personal workflow skills into reusable templates. Before publishing, Skill-Space prepares a generic package, extracts required runtime configuration, and performs a basic safety review so another user can install and configure the workflow locally.

Skill-Space 工作流库用于把个人工作流 Skill 转换为可复用模板。发布前，应用会生成通用模板包、提取运行必填配置，并执行基础安全审计，方便其他用户安装后在本机补齐配置并运行。

## Library Views / 库视图

| View | Purpose |
| --- | --- |
| Installed / 已安装 | Templates that already exist in the local Skill-Space skill library |
| Cloud / 云端库 | Templates fetched from the online catalog |
| Uploaded / 已上传 | Templates published by the current local app and removable from the server |

## Publish Flow / 发布流程

1. Select a working local Skill from the skill library.
2. Click "生成模板并加入库" in the skill detail panel.
3. Skill-Space scans `SKILL.md`, scripts, references, assets, and `.skillspace/` metadata.
4. Local-only values are converted into variables when possible.
5. A template package is written under the local marketplace/publish area.
6. The safety review checks for local paths, plaintext secrets, private accounts, public-account names, and other sensitive values.
7. If the template passes review, it can be uploaded to the cloud library.
8. Other users install it from the cloud library, then fill in required runtime configuration from the installed skill detail page.

## Runtime Configuration / 运行必填配置

Template installation does not ask the user to choose an install path. Templates are installed into the Skill-Space skill directory automatically.

模板安装时不要求用户选择安装路径，默认安装到 Skill-Space 技能库目录。用户只需要在安装后补齐真正影响工作流运行的配置，例如：

- API key, token, secret reference
- Service endpoint, webhook, domain, or database source
- Account name, publishing channel, project name, or business target
- Output language, style, review rules, and delivery format

Variable placeholders use these formats:

```text
{{path.workspace}}
{{secret.api_key}}
{{text.project_name}}
{{service.webhook_url}}
```

## Dependency Handling / 依赖处理

If a workflow skill was created by combining multiple skills, the publish step should include the needed dependent skills or convert them into explicit dependencies. A reusable template should not only contain "call another skill" instructions when that skill may not exist on another user's machine.

如果工作流由多个 Skill 组合而成，发布模板时应当把必要依赖一并纳入模板包，或写成明确依赖项。模板不能只保留“调用某某 Skill”的指令，否则其他用户电脑上没有该 Skill 时就无法复用。

## Online Catalog / 在线目录

The online catalog is hosted at:

```text
https://ailabing.cn/downloads/skill-space/templates/catalog.json
```

Minimal catalog shape:

```json
{
  "schemaVersion": "skillspace.marketplace.catalog.v1",
  "generatedAt": "2026-05-31T10:30:10.000Z",
  "templates": [
    {
      "id": "wechat-daily-article",
      "name": "公众号每日文章自动化",
      "description": "从选题确认、深度文章生成到 md2wechat 草稿同步的通用发布模板。",
      "version": "1.0.0",
      "author": "Skill-Space",
      "category": "公众号",
      "downloads": 0,
      "rating": 0,
      "runtimes": ["claude", "codex"],
      "requiredVariables": [],
      "safetyStatus": "ready",
      "source": "remote",
      "updatedAt": "2026-05-31T10:30:10.000Z"
    }
  ]
}
```

Download counts and ratings should come from real server-side data. If the server has no telemetry, the app should show `0` or omit the metric instead of displaying fake values.

下载数量和评分应来自服务端真实数据。没有统计数据时，应显示 `0` 或隐藏指标，而不是使用假数据。

## Install Flow / 安装流程

1. Open the workflow library.
2. Click "刷新在线库" to fetch the latest remote catalog.
3. Select a template.
4. Review required configuration, dependencies, services, and safety status.
5. Click install. The package is installed into the local Skill-Space skill library.
6. Open the installed skill detail page and fill missing runtime configuration before running it.

## Delete Flow / 删除流程

- Local templates can be removed from the local workflow library.
- Uploaded templates can be removed from the server when the app has the upload token recorded locally.
- Remote templates owned by other users are read-only in the current no-login model.

## Current Support / 当前支持

- Online refresh from `catalog.json`.
- Installed/cloud/uploaded views.
- Template installation into the local skill directory.
- Local publish package generation with safety review.
- Upload to the server without user login.
- Delete uploaded templates when the local upload token is available.
- Smoke tests for marketplace loading and install state.

## Roadmap / 后续方向

- Server-side package validation and sensitive-content scanning.
- Template version history and rollback.
- Real download counters and optional ratings.
- Optional author identity or signing, while keeping no-login upload possible.
- Better dependency bundling for multi-skill workflows.
