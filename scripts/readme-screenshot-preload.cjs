const now = "2026-06-02T09:30:00.000Z";

const config = {
  schemaVersion: "skillspace.config.v1",
  dataRoot: "D:\\Skill-Space",
  defaultRuntime: "claude",
  permissionsMode: "full",
  locale: {
    default: "zh-CN",
    supported: ["zh-CN", "en-US"],
    fallback: "en-US"
  },
  skillRoots: ["D:\\Skill-Space\\skills"],
  importRoot: "D:\\Skill-Space\\imports",
  runsRoot: "D:\\Skill-Space\\runs",
  logsRoot: "D:\\Skill-Space\\logs",
  artifactsRoot: "D:\\Skill-Space\\artifacts",
  registry: {
    type: "sqlite",
    path: "D:\\Skill-Space\\registry\\skillspace.sqlite"
  },
  window: {
    closeToTray: true
  },
  agents: {
    claude: { enabled: true, label: "Claude Code", command: "claude" },
    codex: { enabled: true, label: "Codex", command: "codex" },
    hermes: { enabled: true, label: "Hermes Agent", command: "wsl", args: ["-d", "Ubuntu-24.04", "hermes"] },
    openclaw: { enabled: true, label: "OpenClaw", command: "openclaw" }
  }
};

const agents = [
  { id: "claude", label: "Claude Code", enabled: true, status: "online", detail: "2.1.148 (Claude Code)", command: "claude", checkedAt: now },
  { id: "codex", label: "Codex", enabled: true, status: "online", detail: "codex-cli 0.130.0", command: "codex", checkedAt: now },
  { id: "hermes", label: "Hermes Agent", enabled: true, status: "online", detail: "WSL Ubuntu-24.04", command: "wsl", checkedAt: now },
  { id: "openclaw", label: "OpenClaw", enabled: true, status: "online", detail: "OpenClaw 2026.5.12", command: "openclaw", checkedAt: now }
];

const skills = [
  {
    id: "content-publishing-template",
    name: "内容发布自动化",
    description: "从选题确认、深度文章生成到排版草稿同步的通用发布工作流。",
    version: "2.0.0",
    defaultRuntime: "claude",
    runtimes: ["claude", "codex", "hermes", "openclaw"],
    root: "D:\\Skill-Space\\skills\\content-publishing-template",
    tags: ["内容发布"],
    hasSkillSpaceMetadata: true,
    updatedAt: now
  },
  {
    id: "ai-research-digest",
    name: "AI 研究日报",
    description: "搜索 AI 动态，生成结构化日报并输出可发布页面。",
    version: "1.4.0",
    defaultRuntime: "claude",
    runtimes: ["claude", "codex"],
    root: "D:\\Skill-Space\\skills\\ai-research-digest",
    tags: ["研究"],
    hasSkillSpaceMetadata: true,
    updatedAt: now
  },
  {
    id: "ops-audit-template",
    name: "自动化任务审计",
    description: "扫描本地自动化、运行历史和重复任务，输出可执行清理建议。",
    version: "1.1.0",
    defaultRuntime: "codex",
    runtimes: ["codex", "claude"],
    root: "D:\\Skill-Space\\skills\\ops-audit-template",
    tags: ["运维"],
    hasSkillSpaceMetadata: true,
    updatedAt: now
  },
  {
    id: "skill-space",
    name: "Skill-Space",
    description: "将可复用 Agent 工作流沉淀成通用 SKILL.md 技能，并同步到本地技能库。",
    version: "1.0.0",
    defaultRuntime: "claude",
    runtimes: ["claude", "codex", "hermes", "openclaw"],
    root: "D:\\Skill-Space\\skills\\skill-space",
    tags: ["SkillOps"],
    hasSkillSpaceMetadata: true,
    updatedAt: now
  }
];

const runs = [
  {
    runId: "run-demo-001",
    skillId: "content-publishing-template",
    skillName: "内容发布自动化",
    runtime: "claude",
    status: "waiting_input",
    startedAt: "2026-06-02T09:10:00.000Z",
    input: "生成本周内容选题并等待我确认。",
    runRoot: "D:\\Skill-Space\\runs\\run-demo-001",
    logPath: "D:\\Skill-Space\\runs\\run-demo-001\\events.jsonl",
    lastMessage: "已生成 5 个候选选题，等待用户回复 1-5。"
  },
  {
    runId: "run-demo-002",
    skillId: "ai-research-digest",
    skillName: "AI 研究日报",
    runtime: "codex",
    status: "completed",
    startedAt: "2026-06-02T08:30:00.000Z",
    endedAt: "2026-06-02T08:36:00.000Z",
    input: "汇总今日 AI 研究动态。",
    exitCode: 0,
    runRoot: "D:\\Skill-Space\\runs\\run-demo-002",
    logPath: "D:\\Skill-Space\\runs\\run-demo-002\\events.jsonl"
  }
];

const templates = [
  {
    id: "content-publishing-template",
    name: "内容发布模板",
    description: "从选题确认、文章生成到草稿同步的通用发布模板。",
    version: "2.0.0",
    author: "Skill-Space",
    category: "内容发布",
    downloads: 0,
    rating: 0,
    runtimes: ["claude", "codex", "hermes", "openclaw"],
    requiredVariables: [
      { key: "brand_name", label: "品牌或账号名称", kind: "text", placeholder: "{{text.brand_name}}", example: "示例品牌" },
      { key: "draft_folder", label: "草稿输出目录", kind: "path", placeholder: "{{path.draft_folder}}", example: "D:\\work\\drafts" },
      { key: "publish_token", label: "发布服务 Token", kind: "secret", placeholder: "{{secret.publish_token}}" }
    ],
    requirements: {
      services: ["草稿同步服务"],
      tools: ["md2wechat"],
      notes: ["安装后在技能库填写必要配置。"]
    },
    dependencies: [
      { id: "writer-style", name: "写作风格子技能", version: "1.0.0", reason: "用于生成统一语气。", bundledPath: "dependencies/writer-style" }
    ],
    safetyStatus: "ready",
    source: "remote",
    installed: false,
    uploaded: false,
    updatedAt: now
  },
  {
    id: "ai-research-digest",
    name: "每日 AI 日报",
    description: "搜索 AI 动态，生成日报并输出可发布页面的模板化工作流。",
    version: "1.4.0",
    author: "Skill-Space",
    category: "研究",
    downloads: 0,
    rating: 0,
    runtimes: ["claude", "codex"],
    requiredVariables: [
      { key: "site_domain", label: "站点域名", kind: "text", placeholder: "{{text.site_domain}}", example: "example.com" },
      { key: "output_dir", label: "输出目录", kind: "path", placeholder: "{{path.output_dir}}", example: "D:\\reports" }
    ],
    requirements: { services: ["搜索源"], tools: [], notes: ["可接入本地或云端 LLM。"] },
    safetyStatus: "ready",
    source: "remote",
    installed: true,
    uploaded: false,
    updatedAt: now
  },
  {
    id: "ops-audit-template",
    name: "自动化任务审计",
    description: "扫描本地自动化、运行历史和重复任务，输出可执行清理建议。",
    version: "1.1.0",
    author: "Skill-Space",
    category: "运维",
    downloads: 0,
    rating: 0,
    runtimes: ["codex", "claude"],
    requiredVariables: [],
    requirements: { services: [], tools: [], notes: ["无需额外配置。"] },
    safetyStatus: "ready",
    source: "local",
    installed: true,
    uploaded: true,
    updatedAt: now
  }
];

const detailById = Object.fromEntries(skills.map((skill) => [
  skill.id,
  {
    ...skill,
    skillMarkdown: `---\nname: ${skill.id}\ndescription: ${skill.description}\n---\n\n# ${skill.name}\n\n## 工作流\n\n1. 读取用户目标与必要配置。\n2. 调用依赖技能并生成候选结果。\n3. 需要用户确认时暂停等待。\n4. 完成后输出结构化总结。\n\n## 输出\n\n返回完成状态、失败原因、产物路径和下一步建议。`,
    workflowText: "nodes:\n  - id: plan\n  - id: run\n  - id: confirm\n  - id: summary\n",
    inputSchema: { type: "object", required: ["brand_name"], properties: { brand_name: { type: "string" } } },
    outputSchema: { type: "object", properties: { summary: { type: "string" } } },
    permissions: { mode: "full", filesystem: { read: ["{{path.workspace}}"], write: ["{{path.output_dir}}"] } },
    adapters: { runtimes: skill.runtimes },
    installConfig: { required: ["brand_name", "output_dir"] },
    files: [
      { path: "SKILL.md", kind: "file", size: 2200, updatedAt: now },
      { path: ".skillspace/manifest.json", kind: "file", size: 920, updatedAt: now },
      { path: ".skillspace/workflow.yaml", kind: "file", size: 680, updatedAt: now }
    ]
  }
]));

const api = {
  bootstrap: async () => ({ config, agents, skills, runs, schedules: [] }),
  refreshAgents: async () => agents,
  detectAgentCandidates: async () => agents.map((agent) => ({
    id: agent.id,
    label: agent.label,
    command: agent.command,
    installed: agent.status === "online",
    detail: agent.detail,
    alreadyConfigured: true
  })),
  scanSkills: async () => skills,
  listRuns: async () => runs,
  listSchedules: async () => [],
  listSkillChanges: async () => [
    {
      id: "change-demo",
      skillId: "content-publishing-template",
      skillName: "内容发布自动化",
      detectedAt: now,
      summary: "更新了模板化说明、依赖打包和确认步骤。",
      changedFields: ["skillMarkdown"],
      after: { version: "2.0.0", updatedAt: now, description: skills[0].description }
    }
  ],
  getBackgroundSchedulerStatus: async () => ({
    supported: true,
    enabled: true,
    taskName: "Skill-Space Background Scheduler",
    detail: "后台计划任务已启用，每 5 分钟静默检查到期自动化。",
    state: "Ready",
    nextRunAt: "2026-06-02T09:35:00.000Z",
    lastRunAt: "2026-06-02T09:30:00.000Z",
    silent: true,
    recentErrors: []
  }),
  getLlmStatus: async () => ({
    enabled: true,
    configured: true,
    provider: "openai-compatible",
    model: "skill-space-steward",
    identity: "Skill-Space 管家",
    detail: "管家已就绪，会理解技能库、运行历史、自动化和飞书协同上下文。"
  }),
  getUpdateStatus: async () => ({
    currentVersion: "0.1.39",
    state: "not_available",
    detail: "当前已是最新版本。",
    lastCheckedAt: now
  }),
  listFeishuDecisionLogs: async () => [
    { id: "f-1", at: now, action: "ask_confirmation", reason: "任务需要用户选择选题", message: "等待用户回复 1-5", confidence: 0.96 }
  ],
  getFeishuStatus: async () => ({
    enabled: true,
    configured: true,
    connected: true,
    state: "connected",
    detail: "已连接，手机端可接收执行状态、回复确认并发送任务。",
    receiveIdType: "open_id",
    deliveryStatus: "received",
    deliveryDetail: "电脑端已收到消息，管家正在判断意图。",
    lastInboundText: "任务 2 选择 4",
    lastInboundSender: "mobile-user",
    lastReplyPreview: "已把 4 发送给等待确认的任务。",
    lastReplyAt: now,
    canSend: true
  }),
  getSkillDetail: async (skillId) => detailById[skillId] || detailById[skills[0].id],
  getRunEvents: async () => [
    { runId: "run-demo-001", type: "started", timestamp: "2026-06-02T09:10:00.000Z", message: "Claude Code started content-publishing-template." },
    { runId: "run-demo-001", type: "assistant", timestamp: "2026-06-02T09:12:00.000Z", message: "已生成 5 个候选选题，等待用户回复数字 1-5。" },
    { runId: "run-demo-001", type: "tool", timestamp: "2026-06-02T09:13:00.000Z", message: "已保存候选列表与草稿状态文件。" }
  ],
  listRunArtifacts: async () => [
    { path: "D:\\Skill-Space\\runs\\run-demo-001\\summary.md", name: "summary.md", kind: "file", size: 4096, updatedAt: now },
    { path: "D:\\Skill-Space\\runs\\run-demo-001\\draft.md", name: "draft.md", kind: "file", size: 12288, updatedAt: now }
  ],
  listMarketplaceTemplates: async () => templates,
  refreshMarketplaceTemplates: async () => templates,
  prepareSkillPackage: async (skillId) => ({
    prepared: true,
    skill: skills.find((skill) => skill.id === skillId) || skills[0],
    packageRoot: "D:\\Skill-Space\\publish\\demo",
    manifestPath: "D:\\Skill-Space\\publish\\demo\\.skillspace\\publish.json",
    variables: templates[0].requiredVariables,
    dependencies: templates[0].dependencies,
    requirements: templates[0].requirements,
    warnings: [],
    filesProcessed: 16,
    filesCopied: 12
  }),
  publishSkillTemplate: async (skillId) => ({
    published: true,
    template: templates.find((template) => template.id === skillId) || templates[0],
    packageRoot: "D:\\Skill-Space\\publish\\demo",
    warnings: [],
    message: "已生成通用模板并加入本地工作流库。"
  }),
  askLlm: async () => ({
    result: "我会先识别你想执行、查询还是继续确认，再结合技能库和运行历史给出下一步。"
  }),
  setCloseToTray: async (enabled) => ({ ...config, window: { closeToTray: enabled } }),
  onRunEvent: () => () => undefined,
  onUpdateStatus: () => () => undefined,
  minimizeWindow: async () => undefined,
  toggleMaximizeWindow: async () => undefined,
  closeWindow: async () => undefined
};

window.skillSpace = new Proxy(api, {
  get(target, property) {
    if (property in target) {
      return target[property];
    }
    if (String(property).startsWith("on")) {
      return () => () => undefined;
    }
    return async () => {
      if (String(property).startsWith("delete")) return { deleted: true, message: "OK" };
      if (String(property).startsWith("save")) return config;
      return { ok: true, message: "OK" };
    };
  }
});
