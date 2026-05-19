import type { BootstrapPayload, RunSummary, SkillDetail, SkillSpaceApi } from "../../shared/types";

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
    input: "验证技能是否可被发现并运行。",
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
      claude: { enabled: true, label: "Claude Code" },
      hermes: { enabled: true, label: "Hermes Agent" },
      openclaw: { enabled: true, label: "OpenClaw" },
      codex: { enabled: true, label: "Codex" }
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
      detail: "WSL Ubuntu-24.04",
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
      description: "将可复用 AI Agent 工作流转换为通用 SKILL.md 技能，并补充 Skill-Space 可视化元数据。",
      version: "0.1.0",
      defaultRuntime: "claude",
      runtimes: ["claude", "hermes", "openclaw", "codex"],
      root: "D:\\Skill-Space\\skills\\skill-space-capture",
      tags: ["skillops", "automation", "workflow"],
      hasSkillSpaceMetadata: true,
      updatedAt: now
    },
    {
      id: "skill-space-smoke-test",
      name: "Skill-Space Smoke Test",
      description: "验证 Skill-Space 能否发现、展示并运行通用 SKILL.md 技能包。",
      version: "0.1.0",
      defaultRuntime: "codex",
      runtimes: ["claude", "codex", "hermes", "openclaw"],
      root: "D:\\Skill-Space\\skills\\skill-space-smoke-test",
      tags: ["smoke-test", "skillspace"],
      hasSkillSpaceMetadata: true,
      updatedAt: now
    }
  ],
  runs: mockRuns,
  schedules: []
};

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
      summary: "这个技能用于把可复用工作流沉淀为通用 SKILL.md，并同步到 Skill-Space 管理。"
    }),
    classifySkillTags: async () => ({ skills: mockPayload.skills.map((skill) => ({ ...skill, tags: [skill.tags[0] ?? "通用"] })) }),
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
      detail: "Mock preview scheduler."
    }),
    setBackgroundScheduler: async (enabled) => ({
      supported: true,
      enabled,
      taskName: "Skill-Space Background Scheduler",
      detail: enabled ? "Mock background scheduler enabled." : "Mock background scheduler disabled."
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
    getLlmStatus: async () => ({
      enabled: true,
      configured: true,
      provider: "claude-code",
      model: "skill-space-steward",
      identity: "Skill-Space 管家",
      detail: "Mock preview Skill-Space steward is ready."
    }),
    saveLlmConfig: async (request) => ({
      enabled: request.enabled,
      configured: true,
      provider: request.provider,
      model: request.model,
      baseUrl: request.baseUrl,
      identity: "Skill-Space 管家",
      detail: "Mock preview LLM config saved."
    }),
    askLlm: async () => ({ result: "这是 Skill-Space 的本地 LLM 分析结果预览。" }),
    getUpdateStatus: async () => ({
      currentVersion: "0.1.1",
      state: "idle",
      detail: "Mock preview updater is ready."
    }),
    checkForUpdates: async () => ({
      currentVersion: "0.1.1",
      state: "not_available",
      detail: "Mock preview is already up to date.",
      lastCheckedAt: now
    }),
    downloadUpdate: async () => ({
      currentVersion: "0.1.1",
      state: "downloaded",
      detail: "Mock preview update downloaded.",
      availableVersion: "0.1.1",
      downloaded: true
    }),
    installUpdate: async () => undefined,
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
    onRunEvent: () => () => undefined
  } satisfies SkillSpaceApi;
}
