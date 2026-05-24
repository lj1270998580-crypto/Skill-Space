const fs = require("node:fs");
const path = require("node:path");

const outDir = path.join(process.cwd(), "release", "templates");
fs.mkdirSync(outDir, { recursive: true });

const updatedAt = "2026-05-22T08:00:00.000Z";

function skillMarkdown(template, sections) {
  return [
    "---",
    `name: ${template.id}`,
    `description: ${template.description}`,
    "---",
    "",
    `# ${template.name}`,
    "",
    template.description,
    "",
    ...sections,
    "",
    "## 输出要求",
    "",
    "- 清晰汇报执行状态、产物路径和下一步建议。",
    "- 如需用户确认，必须列出具体选项并等待回复。",
    "- 不要写入真实密钥；需要密钥时使用用户配置或环境变量。",
    ""
  ].join("\n");
}

const templates = [
  {
    id: "wechat-daily-article",
    name: "公众号每日文章自动化",
    description: "从选题确认、深度文章生成到 md2wechat 草稿同步的通用发布模板。",
    version: "1.0.0",
    author: "Skill-Space",
    category: "公众号",
    downloads: 1280,
    rating: 4.8,
    runtimes: ["claude", "codex"],
    safetyStatus: "ready",
    source: "remote",
    updatedAt,
    requiredVariables: [
      { key: "workspace_path", label: "工作目录", kind: "path", placeholder: "{{path.workspace_path}}", example: "D:\\work\\wechat" },
      { key: "wechat_account", label: "公众号名称", kind: "text", placeholder: "{{text.wechat_account}}", example: "我的公众号" },
      { key: "topic_scope", label: "选题范围", kind: "text", placeholder: "{{text.topic_scope}}", example: "AI热点、品牌增长、内容营销" },
      { key: "writing_style", label: "写作风格", kind: "text", placeholder: "{{text.writing_style}}", example: "专业但可读，带案例" },
      { key: "publish_channel", label: "发布渠道", kind: "text", placeholder: "{{text.publish_channel}}", example: "微信公众号草稿" }
    ]
  },
  {
    id: "ai-daily-report",
    name: "每日 AI 日报",
    description: "搜索 AI 动态、生成日报并输出可发布页面的模板化工作流。",
    version: "1.0.0",
    author: "Skill-Space",
    category: "研究",
    downloads: 842,
    rating: 4.7,
    runtimes: ["claude", "openclaw", "codex"],
    safetyStatus: "ready",
    source: "remote",
    updatedAt,
    requiredVariables: [
      { key: "site_root", label: "站点目录", kind: "path", placeholder: "{{path.site_root}}", example: "D:\\site\\daily" },
      { key: "topic_scope", label: "关注范围", kind: "text", placeholder: "{{text.topic_scope}}", example: "AI Agent、模型更新、工具生态" },
      { key: "report_audience", label: "读者对象", kind: "text", placeholder: "{{text.report_audience}}", example: "独立开发者和AI产品负责人" },
      { key: "publish_format", label: "输出格式", kind: "text", placeholder: "{{text.publish_format}}", example: "Markdown + 首页HTML摘要" }
    ]
  },
  {
    id: "automation-audit",
    name: "自动化任务审计",
    description: "扫描本地自动化、运行历史和重复任务，输出可执行的清理建议。",
    version: "0.2.0",
    author: "Skill-Space",
    category: "运维",
    downloads: 516,
    rating: 4.6,
    runtimes: ["codex", "claude"],
    safetyStatus: "review_required",
    source: "remote",
    updatedAt,
    requiredVariables: [
      { key: "audit_root", label: "审计目录", kind: "path", placeholder: "{{path.audit_root}}", example: "D:\\Skill-Space" },
      { key: "audit_goal", label: "审计目标", kind: "text", placeholder: "{{text.audit_goal}}", example: "找出失败率高、重复或长期未运行的自动化" }
    ]
  },
  {
    id: "skill-space-research",
    name: "Skill-Space 研究",
    description: "结合顶级技术文档与最新 Agent/工具信息，一次研究一个 Skill-Space 值得升级的功能点，产出可执行的迭代参考文档。",
    version: "1.0.0",
    author: "Skill-Space",
    category: "研究",
    downloads: 0,
    rating: 0,
    runtimes: ["claude", "codex"],
    safetyStatus: "ready",
    source: "remote",
    updatedAt,
    requiredVariables: [
      { key: "research_topic", label: "研究主题", kind: "text", placeholder: "{{text.research_topic}}", example: "工作流模板库的审核与安装体验" },
      { key: "output_format", label: "输出格式", kind: "text", placeholder: "{{text.output_format}}", example: "Markdown 方案 + 待办清单" }
    ]
  }
];

for (const template of templates) {
  if (template.id === "wechat-daily-article") {
    template.templateMarkdown = skillMarkdown(template, [
      "## 运行配置",
      "",
      "- 公众号：{{text.wechat_account}}",
      "- 选题范围：{{text.topic_scope}}",
      "- 写作风格：{{text.writing_style}}",
      "- 发布渠道：{{text.publish_channel}}",
      "",
      "## 工作流",
      "",
      "1. 先生成 3-5 个候选选题，等待用户选择。",
      "2. 用户回复编号或自定义选题后，再生成文章大纲。",
      "3. 按用户确认的大纲完成正文、标题、摘要和封面图提示词。",
      "4. 输出 md2wechat 友好的 Markdown，并同步到发布草稿。"
    ]);
  }

  if (template.id === "ai-daily-report") {
    template.templateMarkdown = skillMarkdown(template, [
      "## 运行配置",
      "",
      "- 关注范围：{{text.topic_scope}}",
      "- 读者对象：{{text.report_audience}}",
      "- 输出格式：{{text.publish_format}}",
      "",
      "## 工作流",
      "",
      "1. 搜索并筛选当天重要 AI 动态。",
      "2. 按影响力、可信度和读者价值排序。",
      "3. 生成日报正文、摘要、来源清单和发布页面内容。",
      "4. 标记不确定信息，避免把未经证实的内容写成事实。"
    ]);
  }

  if (template.id === "automation-audit") {
    template.templateMarkdown = skillMarkdown(template, [
      "## 运行配置",
      "",
      "- 审计目标：{{text.audit_goal}}",
      "",
      "## 工作流",
      "",
      "1. 扫描 Skill-Space 自动化任务、运行历史和错误日志。",
      "2. 找出重复任务、长期失败任务、长期未运行任务和缺少通知的任务。",
      "3. 输出风险等级、原因和建议操作。",
      "4. 不直接删除任务，除非用户明确确认。"
    ]);
  }

  if (template.id === "skill-space-research") {
    template.templateMarkdown = skillMarkdown(template, [
      "## 运行配置",
      "",
      "- 研究主题：{{text.research_topic}}",
      "- 输出格式：{{text.output_format}}",
      "",
      "## 工作流",
      "",
      "1. 明确研究问题和应用场景。",
      "2. 检索/整理可验证资料和同类工具做法。",
      "3. 输出可落地的产品建议、工程改动点和验证清单。",
      "4. 给出低风险优先级排序。"
    ]);
  }
}

const catalog = {
  schemaVersion: "skillspace.marketplace.catalog.v1",
  generatedAt: new Date().toISOString(),
  templates
};

fs.writeFileSync(path.join(outDir, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(path.join(outDir, "catalog.json"));
