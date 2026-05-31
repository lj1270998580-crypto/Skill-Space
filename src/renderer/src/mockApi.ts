import type { BootstrapPayload, RunSummary, SkillDetail, SkillSpaceApi, SkillTemplateListing } from "../../shared/types";

const now = new Date().toISOString();

const mockRuns: RunSummary[] = [
  {
    runId: "mock-run-20260517",
    skillId: "skill-space-smoke-test",
    skillName: "Skill-Space Smoke Test",
    runtime: "codex",
    status: "completed",
    startedAt: now,
    endedAt: now,
    input: "Validate that Skill-Space can find and run a portable skill.",
    exitCode: 0,
    runRoot: "D:\\Skill-Space\\runs\\mock-run-20260517",
    logPath: "D:\\Skill-Space\\runs\\mock-run-20260517\\events.jsonl"
  }
];

const mockPayload: BootstrapPayload = {
  config: {
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
    agents: {
      claude: { enabled: true, label: "Claude Code", command: "claude" },
      hermes: { enabled: true, label: "Hermes Agent", command: "wsl", args: ["-d", "Ubuntu", "--", "hermes", "{{prompt}}"] },
      openclaw: { enabled: true, label: "OpenClaw", command: "openclaw" },
      codex: { enabled: true, label: "Codex", command: "codex" }
    },
    window: {
      closeToTray: false
    }
  },
  agents: [
    {
      id: "claude",
      label: "Claude Code",
      enabled: true,
      status: "online",
      detail: "2.1.142",
      command: "claude",
      checkedAt: now
    },
    {
      id: "hermes",
      label: "Hermes Agent",
      enabled: true,
      status: "online",
      detail: "WSL Ubuntu",
      command: "wsl",
      checkedAt: now
    },
    {
      id: "openclaw",
      label: "OpenClaw",
      enabled: true,
      status: "online",
      detail: "2026.5.7",
      command: "openclaw",
      checkedAt: now
    },
    {
      id: "codex",
      label: "Codex",
      enabled: true,
      status: "online",
      detail: "codex-cli 0.130.0",
      command: "codex",
      checkedAt: now
    }
  ],
  skills: [
    {
      id: "skill-space-capture",
      name: "Skill-Space Capture",
      description: "Convert reusable AI agent workflows into portable SKILL.md packages and Skill-Space metadata.",
      version: "0.1.0",
      defaultRuntime: "claude",
      runtimes: ["claude", "hermes", "openclaw", "codex"],
      root: "D:\\Skill-Space\\skills\\skill-space-capture",
      tags: ["skillops"],
      hasSkillSpaceMetadata: true,
      updatedAt: now
    },
    {
      id: "skill-space-smoke-test",
      name: "Skill-Space Smoke Test",
      description: "Verify that Skill-Space can discover, display, and run a generic SKILL.md package.",
      version: "0.1.0",
      defaultRuntime: "codex",
      runtimes: ["claude", "codex", "hermes", "openclaw"],
      root: "D:\\Skill-Space\\skills\\skill-space-smoke-test",
      tags: ["test"],
      hasSkillSpaceMetadata: true,
      updatedAt: now
    }
  ],
  runs: mockRuns,
  schedules: []
};

let mockMarketplaceTemplates: SkillTemplateListing[] = [
  {
    id: "wechat-daily-article",
    name: "公众号每日文章自动化",
    description: "从选题、深度文章生成、封面插图到同步草稿的公众号工作流模板。",
    version: "1.0.0",
    author: "Skill-Space",
    category: "公众号",
    downloads: 126,
    rating: 4.8,
    runtimes: ["claude", "codex", "hermes", "openclaw"],
    safetyStatus: "ready",
    updatedAt: now,
    requiredVariables: [
      { key: "brand_name", label: "品牌或公众号名", kind: "text", placeholder: "{{text.brand_name}}", example: "北陌大叔" },
      { key: "draft_folder", label: "草稿目录", kind: "path", placeholder: "{{path.draft_folder}}", example: "D:\\work\\drafts" }
    ]
  },
  {
    id: "ai-daily-report",
    name: "每日 AI 日报",
    description: "抓取 AI 动态、生成摘要并发布到指定目录或服务器。",
    version: "1.0.0",
    author: "Skill-Space",
    category: "研究",
    downloads: 88,
    rating: 4.7,
    runtimes: ["claude", "codex"],
    safetyStatus: "ready",
    updatedAt: now,
    requiredVariables: [
      { key: "site_domain", label: "站点域名", kind: "text", placeholder: "{{text.site_domain}}", example: "ailabing.cn" },
      { key: "output_dir", label: "输出目录", kind: "path", placeholder: "{{path.output_dir}}", example: "D:\\reports\\ai" }
    ]
  }
];

const mockDetails: Record<string, SkillDetail> = Object.fromEntries(
  mockPayload.skills.map((skill) => [
    skill.id,
    {
      ...skill,
      skillMarkdown: `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n# ${skill.name}\n\n${skill.description}`,
      workflowText:
        "nodes:\n  - id: skill\n    label: SKILL.md\n  - id: agent\n    label: Agent\n  - id: result\n    label: Result\n",
      inputSchema: { type: "object", properties: { input: { type: "string" } } },
      outputSchema: { type: "object", properties: { result: { type: "string" } } },
      permissions: { mode: "full", filesystem: { read: ["*"], write: ["*"] } },
      adapters: { runtimes: skill.runtimes },
      files: [
        { path: "SKILL.md", kind: "file", size: 360, updatedAt: now },
        { path: ".skillspace/manifest.json", kind: "file", size: 720, updatedAt: now },
        { path: ".skillspace/workflow.yaml", kind: "file", size: 280, updatedAt: now }
      ]
    }
  ])
);

export function installMockApiWhenMissing(): void {
  if (window.skillSpace) {
    return;
  }

  window.skillSpace = {
    bootstrap: async () => mockPayload,
    refreshAgents: async () => mockPayload.agents,
    detectAgentCandidates: async () =>
      mockPayload.agents.map((agent) => ({
        id: agent.id,
        label: agent.label,
        command: agent.command ?? agent.id,
        installed: agent.status === "online",
        detail: agent.detail,
        alreadyConfigured: Boolean(mockPayload.config.agents[agent.id])
      })),
    saveAgentConfig: async (request) => {
      mockPayload.config.agents[request.agentId] = request.config;
      return mockPayload;
    },
    testAgentConfig: async (request) => ({
      id: request.agentId,
      label: request.config.label,
      enabled: request.config.enabled,
      status: request.config.command ? "online" : "offline",
      detail: request.config.command ? "Mock agent command is available." : "Missing command.",
      command: request.config.command,
      checkedAt: now
    }),
    deleteAgentConfig: async (agentId) => {
      delete mockPayload.config.agents[agentId];
      mockPayload.agents = mockPayload.agents.filter((agent) => agent.id !== agentId);
      return mockPayload;
    },
    chooseStorageRoot: async () => "D:\\Skill-Space",
    saveStorageRoot: async (request) => {
      mockPayload.config.dataRoot = request.dataRoot;
      mockPayload.config.skillRoots = [`${request.dataRoot}\\skills`];
      mockPayload.config.importRoot = `${request.dataRoot}\\imports`;
      mockPayload.config.runsRoot = `${request.dataRoot}\\runs`;
      mockPayload.config.logsRoot = `${request.dataRoot}\\logs`;
      mockPayload.config.artifactsRoot = `${request.dataRoot}\\artifacts`;
      mockPayload.config.registry.path = `${request.dataRoot}\\registry\\skillspace.sqlite`;
      return mockPayload;
    },
    scanSkills: async () => mockPayload.skills,
    discoverSkills: async () => [],
    importDiscoveredSkill: async () => ({ imported: false, message: "Mock preview does not import files." }),
    listSkillChanges: async () => [],
    listRuns: async () => mockRuns,
    getRunEvents: async () => [],
    listRunArtifacts: async () => [
      {
        path: "D:\\Skill-Space\\runs\\mock-run-20260517\\prompt.txt",
        name: "prompt.txt",
        kind: "file",
        size: 420,
        updatedAt: now
      }
    ],
    openRunFolder: async () => ({ opened: true, message: "D:\\Skill-Space\\runs\\mock-run-20260517" }),
    deleteRun: async () => ({ deleted: true }),
    getSkillDetail: async (skillId: string) => mockDetails[skillId] ?? mockDetails["skill-space-capture"],
    deleteSkill: async () => ({ deleted: true }),
    summarizeSkill: async (skillId: string) => ({
      skill: mockPayload.skills.find((skill) => skill.id === skillId) ?? mockPayload.skills[0],
      summary: "This mock summary explains the selected skill in plain language."
    }),
    editSkillWithLlm: async (request) => {
      const detail = mockDetails[request.skillId] ?? mockDetails["skill-space-capture"];
      return {
        skill: {
          ...detail,
          skillMarkdown: `${detail.skillMarkdown}\n\n## Mock Edit\n\n${request.instruction}`
        },
        summary: "Mock preview generated a SKILL.md update proposal."
      };
    },
    classifySkillTags: async () => ({ skills: mockPayload.skills.map((skill) => ({ ...skill, tags: [skill.tags[0] ?? "general"] })) }),
    prepareSkillPackage: async (skillId: string) => ({
      prepared: true,
      skill: mockPayload.skills.find((skill) => skill.id === skillId) ?? mockPayload.skills[0],
      packageRoot: "D:\\Skill-Space\\publish\\mock-skill-package",
      manifestPath: "D:\\Skill-Space\\publish\\mock-skill-package\\.skillspace\\publish.json",
      variables: [],
      warnings: [],
      filesProcessed: 3,
      filesCopied: 4
    }),
    publishSkillTemplate: async (skillId: string) => {
      const skill = mockPayload.skills.find((item) => item.id === skillId) ?? mockPayload.skills[0];
      const template = {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        version: skill.version,
        author: "Local",
        category: skill.tags[0] ?? "SkillOps",
        downloads: 0,
        rating: 0,
        runtimes: skill.runtimes,
        requiredVariables: [],
        safetyStatus: "ready" as const,
        updatedAt: now,
        source: "local" as const,
        packageRoot: "D:\\Skill-Space\\publish\\mock-skill-package"
      };
      mockMarketplaceTemplates.unshift(template);
      return {
        published: true,
        template,
        packageRoot: template.packageRoot,
        warnings: [],
        message: `Mock published ${skill.name}.`
      };
    },
    deleteMarketplaceTemplate: async (templateId: string) => {
      const before = mockMarketplaceTemplates.length;
      mockMarketplaceTemplates = mockMarketplaceTemplates.filter((template) => template.id !== templateId || template.source !== "local");
      return {
        deleted: mockMarketplaceTemplates.length < before,
        message: mockMarketplaceTemplates.length < before ? "Mock template deleted." : "Mock template was not local."
      };
    },
    deleteUploadedMarketplaceTemplate: async (templateId: string) => {
      const before = mockMarketplaceTemplates.length;
      mockMarketplaceTemplates = mockMarketplaceTemplates.filter((template) => template.id !== templateId);
      return {
        deleted: mockMarketplaceTemplates.length < before,
        message: mockMarketplaceTemplates.length < before ? "Mock remote template deleted." : "Mock remote template not found."
      };
    },
    shareMarketplaceTemplate: async (templateId: string) => ({
      shared: true,
      uploaded: true,
      packageRoot: `D:\\Skill-Space\\marketplace\\share\\${templateId}`,
      catalogPath: `D:\\Skill-Space\\marketplace\\share\\${templateId}\\catalog.json`,
      message: `Mock share package generated for ${templateId}.`
    }),
    listMarketplaceTemplates: async () => mockMarketplaceTemplates,
    refreshMarketplaceTemplates: async () => mockMarketplaceTemplates.map((template) => ({
      ...template,
      installed: mockPayload.skills.some((skill) => skill.id === template.id || skill.id === `${template.id}-installed`)
    })),
    installMarketplaceTemplate: async (request) => {
      const template = mockMarketplaceTemplates.find((item) => item.id === request.templateId) ?? mockMarketplaceTemplates[0];
      const skill = {
        id: `${template.id}-installed`,
        name: template.name,
        description: template.description,
        version: template.version,
        defaultRuntime: template.runtimes[0] ?? "claude",
        runtimes: template.runtimes,
        root: `D:\\Skill-Space\\skills\\${template.id}-installed`,
        tags: [template.category],
        hasSkillSpaceMetadata: true,
        updatedAt: now
      };
      mockPayload.skills = [skill, ...mockPayload.skills.filter((item) => item.id !== skill.id)];
      return {
        installed: true,
        skill,
        message: `Mock installed ${template.name}.`
      };
    },
    importSkill: async () => ({
      imported: false,
      message: "Mock preview does not import files."
    }),
    runSkill: async () => ({ runId: "mock-run" }),
    continueRun: async (request) => ({ runId: request.runId }),
    listSchedules: async () => [],
    createSchedule: async (request) => ({
      id: "mock-schedule",
      name: request.name,
      skillId: request.skillId,
      skillName: request.skillId,
      runtime: request.runtime,
      input: request.input,
      cadence: request.cadence,
      timeOfDay: request.timeOfDay,
      intervalMinutes: request.intervalMinutes,
      dayOfWeek: request.dayOfWeek,
      dayOfMonth: request.dayOfMonth,
      enabled: true,
      createdAt: now,
      nextRunAt: now
    }),
    deleteSchedule: async () => ({ deleted: true }),
    toggleSchedule: async (scheduleId, enabled) => ({
      id: scheduleId,
      name: "Mock schedule",
      skillId: "skill-space-smoke-test",
      skillName: "Skill-Space Smoke Test",
      runtime: "claude",
      input: "",
      cadence: "daily",
      enabled,
      createdAt: now,
      nextRunAt: now
    }),
    getBackgroundSchedulerStatus: async () => ({
      supported: true,
      enabled: false,
      taskName: "Skill-Space Background Scheduler",
      detail: "Mock preview scheduler.",
      recentErrors: []
    }),
    setBackgroundScheduler: async (enabled) => ({
      supported: true,
      enabled,
      taskName: "Skill-Space Background Scheduler",
      detail: enabled ? "Mock background scheduler enabled." : "Mock background scheduler disabled.",
      recentErrors: []
    }),
    clearBackgroundSchedulerErrors: async () => ({
      supported: true,
      enabled: false,
      taskName: "Skill-Space Background Scheduler",
      detail: "Mock scheduler errors cleared.",
      recentErrors: []
    }),
    getFeishuStatus: async () => ({
      enabled: false,
      configured: false,
      connected: false,
      state: "disabled",
      detail: "Mock preview Feishu messaging is disabled.",
      receiveIdType: "open_id",
      canSend: false
    }),
    startFeishuConnect: async () => ({
      enabled: true,
      configured: false,
      connected: false,
      state: "connecting",
      detail: "Mock preview QR connection is waiting.",
      receiveIdType: "open_id",
      canSend: false
    }),
    saveFeishuConfig: async (request) => ({
      enabled: request.enabled,
      configured: Boolean(request.appId),
      connected: false,
      state: request.enabled ? "connecting" : "disabled",
      detail: "Mock preview Feishu config saved.",
      appId: request.appId,
      receiveId: request.receiveId,
      receiveIdType: request.receiveIdType,
      canSend: Boolean(request.enabled && request.appId && request.receiveId)
    }),
    setFeishuEnabled: async (enabled) => ({
      enabled,
      configured: false,
      connected: false,
      state: enabled ? "not_configured" : "disabled",
      detail: enabled ? "Mock preview Feishu messaging enabled." : "Mock preview Feishu messaging disabled.",
      receiveIdType: "open_id",
      canSend: false
    }),
    sendFeishuTest: async () => ({
      enabled: true,
      configured: true,
      connected: true,
      state: "connected",
      detail: "Mock preview test sent.",
      receiveIdType: "open_id",
      canSend: true
    }),
    listFeishuDecisionLogs: async () => [
      {
        id: "mock-decision",
        at: now,
        action: "chat",
        reason: "Mock preview routed this as a steward chat.",
        message: "hello"
      }
    ],
    getLlmStatus: async () => ({
      enabled: true,
      configured: true,
      provider: "claude-code",
      model: "skill-space-steward",
      identity: "Skill-Space Steward",
      detail: "Mock preview Skill-Space steward is ready."
    }),
    saveLlmConfig: async (request) => ({
      enabled: request.enabled,
      configured: true,
      provider: request.provider,
      model: request.model,
      baseUrl: request.baseUrl,
      identity: "Skill-Space Steward",
      detail: "Mock preview LLM config saved."
    }),
    askLlm: async () => ({ result: "This is a mock Skill-Space steward response." }),
    getUpdateStatus: async () => ({
      currentVersion: "0.1.8",
      state: "idle",
      detail: "Mock preview updater is ready."
    }),
    checkForUpdates: async () => ({
      currentVersion: "0.1.8",
      state: "not_available",
      detail: "Mock preview is already up to date.",
      lastCheckedAt: now
    }),
    downloadUpdate: async () => ({
      currentVersion: "0.1.8",
      state: "downloaded",
      detail: "Mock preview update downloaded.",
      availableVersion: "0.1.8",
      downloaded: true
    }),
    installUpdate: async () => undefined,
    setCloseToTray: async (enabled) => {
      mockPayload.config.window.closeToTray = enabled;
      return mockPayload.config;
    },
    minimizeWindow: async () => {
      document.body.classList.add("preview-minimized");
      window.setTimeout(() => document.body.classList.remove("preview-minimized"), 700);
    },
    toggleMaximizeWindow: async () => {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen().catch(() => undefined);
      } else {
        await document.exitFullscreen().catch(() => undefined);
      }
    },
    closeWindow: async () => {
      document.body.classList.toggle("preview-closed");
    },
    onRunEvent: () => () => undefined,
    onUpdateStatus: () => () => undefined
  } satisfies SkillSpaceApi;
}
