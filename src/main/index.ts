import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell, Tray, type OpenDialogOptions } from "electron";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import QRCode from "qrcode";
import type {
  AgentConfig,
  AgentCandidate,
  AgentHealth,
  AgentId,
  BackgroundSchedulerStatus,
  BootstrapPayload,
  ClassifySkillTagsResponse,
  ContinueRunRequest,
  ContinueRunResponse,
  CreateScheduleRequest,
  DeleteTemplateResponse,
  DiscoveredSkill,
  EditSkillWithLlmRequest,
  EditSkillWithLlmResponse,
  FeishuReceiveIdType,
  FeishuStatus,
  ImportSkillResponse,
  InstallTemplateRequest,
  InstallTemplateResponse,
  LlmAnalyzeRequest,
  LlmAnalyzeResponse,
  LlmManagerStatus,
  LlmProvider,
  PrepareSkillPackageResponse,
  PublishTemplateResponse,
  PublishTemplateVariable,
  ShareTemplateResponse,
  SkillTemplateDependency,
  TemplatePackageFile,
  FeishuDecisionLogEntry,
  RunEvent,
  RunArtifact,
  RunSkillRequest,
  RunSkillResponse,
  RunSummary,
  SaveAgentConfigRequest,
  SaveFeishuConfigRequest,
  SaveLlmConfigRequest,
  SaveStorageRootRequest,
  ScheduledTask,
  SkillChange,
  SkillDetail,
  SkillFileEntry,
  SkillSpaceConfig,
  SkillTemplateListing,
  SkillSummary,
  UpdateStatus
} from "../shared/types";

const nodeRequire = createRequire(import.meta.url);
const { autoUpdater } = nodeRequire("electron-updater") as typeof import("electron-updater");
const legacyConfigPath = "D:\\Skill-Space\\config\\skillspace.config.json";
const marketplaceCatalogUrl = "https://ailabing.cn/downloads/skill-space/templates/catalog.json";
const marketplaceUploadUrl = "https://ailabing.cn/api/skill-space/templates/upload";
const marketplaceDeleteUrl = "https://ailabing.cn/api/skill-space/templates/delete";

type UploadedTemplateState = {
  ids: Set<string>;
  tokens: Map<string, string>;
};

function defaultDataRoot(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(process.env.USERPROFILE ?? "C:\\", "AppData", "Roaming"), "Skill-Space");
  }
  return join(process.env.HOME ?? ".", ".skill-space");
}

function activeConfigPath(): string {
  return join(defaultDataRoot(), "config", "skillspace.config.json");
}

function isPathInside(parent: string, target: string, allowEqual = false): boolean {
  const resolvedParent = resolve(parent);
  const resolvedTarget = resolve(target);
  if (allowEqual && resolvedParent === resolvedTarget) {
    return true;
  }
  const distance = relative(resolvedParent, resolvedTarget);
  return Boolean(distance) && !distance.startsWith("..") && !isAbsolute(distance);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bundledResourcePath(fileName: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, "resources", fileName)
    : join(app.getAppPath(), "resources", fileName);
}

const appIconPath = bundledResourcePath(process.platform === "win32" ? "skill-space-liquid.ico" : "skill-space.png");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let closeToTrayEnabled = false;
let isQuitting = false;
let schedulerTimer: NodeJS.Timeout | null = null;
type FeishuSendInput = { text: string } | { markdown: string } | { post: object };
type FeishuSendOptions = { replyTo?: string; replyInThread?: boolean };
type FeishuChannelLike = {
  connect?: () => Promise<void>;
  disconnect?: () => Promise<void>;
  send?: (to: string, input: FeishuSendInput, options?: FeishuSendOptions) => Promise<unknown>;
  editMessage?: (messageId: string, text: string) => Promise<void>;
  addReaction?: (messageId: string, emojiType: string) => Promise<string>;
  removeReaction?: (messageId: string, reactionId: string) => Promise<void>;
  removeReactionByEmoji?: (messageId: string, emojiType: string) => Promise<boolean>;
  botIdentity?: {
    openId?: string;
    name?: string;
  };
  rawClient?: {
    im?: {
      v1?: {
        message?: {
          update?: (args: unknown) => Promise<unknown>;
        };
      };
    };
  };
  on?: (...args: unknown[]) => unknown;
};
let feishuChannel: FeishuChannelLike | null = null;
let feishuRuntimeState: FeishuStatus["state"] = "not_configured";
let feishuQrState: Pick<FeishuStatus, "qrDataUrl" | "qrUrl" | "qrExpiresAt"> = {};
let feishuLastInboundAt: string | undefined;
let feishuLastOutboundAt: string | undefined;
let feishuDeliveryStatus: FeishuStatus["deliveryStatus"] = "idle";
let feishuDeliveryDetail: string | undefined;
let feishuLastInboundText: string | undefined;
let feishuLastInboundSender: string | undefined;
let feishuLastReplyPreview: string | undefined;
let feishuLastReplyAt: string | undefined;
let feishuProcessing = false;
let feishuLastError: string | undefined;
let feishuRegisterController: AbortController | null = null;
const feishuHandledMessageIds = new Map<string, number>();
const feishuMessageChunkLimit = 2_800;
const feishuReceiptEmojiCandidates = ["THINKING", "OK", "DONE", "SMILE"];
const isBackgroundSchedulerProcess = process.argv.includes("--background-scheduler");
let updateStatus: UpdateStatus = {
  currentVersion: app.getVersion(),
  state: "idle",
  detail: "在线更新已就绪。"
};

type FeishuStoredConfig = {
  schemaVersion: "skillspace.feishu.v1";
  enabled: boolean;
  appId: string;
  encryptedAppSecret: string;
  receiveId?: string;
  receiveIdType: FeishuReceiveIdType;
  createdAt: string;
  updatedAt: string;
};

type LlmStoredConfig = {
  schemaVersion: "skillspace.llm.v1";
  enabled: boolean;
  provider: LlmProvider;
  model: string;
  baseUrl?: string;
  encryptedApiKey?: string;
  updatedAt: string;
};

type FeishuIntent = {
  action: "run_skill" | "list_skills" | "status" | "help" | "chat" | "reply_waiting" | "clarify_waiting";
  skillId?: string;
  input?: string;
  reply?: string;
  runId?: string;
  runIndex?: number;
  waitingReply?: string;
  confidence?: number;
};

type LlmConversationMessage = {
  role: "user" | "assistant";
  content: string;
  at?: string;
};

const detectableAgentCandidates: Array<Omit<AgentCandidate, "installed" | "detail" | "alreadyConfigured">> = [
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    args: ["--bare", "-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"]
  },
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    args: [
      "--ask-for-approval",
      "never",
      "exec",
      "--sandbox",
      "danger-full-access",
      "--skip-git-repo-check",
      "--json",
      "{{prompt}}"
    ]
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    command: "openclaw",
    args: ["agent", "--local", "--message", "{{prompt}}", "--json"]
  },
  {
    id: "hermes",
    label: "Hermes Agent",
    command: "wsl",
    args: ["-d", "Ubuntu", "--", "hermes", "-z", "{{prompt}}"]
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    command: "gemini",
    args: ["-p", "{{prompt}}"]
  },
  {
    id: "qwen-code",
    label: "Qwen Code",
    command: "qwen",
    args: ["-p", "{{prompt}}"]
  },
  {
    id: "opencode",
    label: "OpenCode",
    command: "opencode",
    args: ["run", "{{prompt}}"]
  },
  {
    id: "aider",
    label: "Aider",
    command: "aider",
    args: ["--message", "{{prompt}}"]
  }
];
const builtInAgentIds = new Set<AgentId>(["claude", "codex", "openclaw", "hermes"]);
const marketplaceTemplates: SkillTemplateListing[] = [
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
    requiredVariables: [
      { key: "workspace_path", label: "工作目录", kind: "path", placeholder: "{{path.workspace_path}}", example: "D:\\work\\wechat" },
      { key: "wechat_account", label: "公众号名称", kind: "text", placeholder: "{{text.wechat_account}}", example: "我的公众号" },
      { key: "topic_scope", label: "选题范围", kind: "text", placeholder: "{{text.topic_scope}}", example: "AI热点、品牌增长、内容营销" },
      { key: "writing_style", label: "写作风格", kind: "text", placeholder: "{{text.writing_style}}", example: "卡兹克风格，犀利但可读" },
      { key: "publish_channel", label: "发布渠道", kind: "text", placeholder: "{{text.publish_channel}}", example: "微信公众号草稿" }
    ],
    safetyStatus: "ready",
    source: "official",
    updatedAt: "2026-05-22T00:00:00.000Z"
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
    requiredVariables: [
      { key: "site_root", label: "网站目录", kind: "path", placeholder: "{{path.site_root}}", example: "D:\\site\\daily" },
      { key: "topic_scope", label: "关注范围", kind: "text", placeholder: "{{text.topic_scope}}", example: "AI Agent, 模型更新, 工具生态" },
      { key: "report_audience", label: "读者对象", kind: "text", placeholder: "{{text.report_audience}}", example: "独立开发者和AI产品负责人" },
      { key: "publish_format", label: "输出格式", kind: "text", placeholder: "{{text.publish_format}}", example: "Markdown + 首页HTML摘要" }
    ],
    safetyStatus: "ready",
    source: "official",
    updatedAt: "2026-05-22T00:00:00.000Z"
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
    requiredVariables: [
      { key: "audit_root", label: "审计目录", kind: "path", placeholder: "{{path.audit_root}}", example: "D:\\Skill-Space" },
      { key: "audit_goal", label: "审计目标", kind: "text", placeholder: "{{text.audit_goal}}", example: "找出失败率高、重复或长期未运行的自动化" }
    ],
    safetyStatus: "review_required",
    source: "official",
    updatedAt: "2026-05-22T00:00:00.000Z"
  }
];

const fallbackConfig: SkillSpaceConfig = {
  schemaVersion: "skillspace.config.v1",
  dataRoot: defaultDataRoot(),
  defaultRuntime: "claude",
  permissionsMode: "full",
  locale: {
    default: "zh-CN",
    supported: ["zh-CN", "en-US"],
    fallback: "en-US"
  },
  skillRoots: [join(defaultDataRoot(), "skills")],
  importRoot: join(defaultDataRoot(), "imports"),
  runsRoot: join(defaultDataRoot(), "runs"),
  logsRoot: join(defaultDataRoot(), "logs"),
  artifactsRoot: join(defaultDataRoot(), "artifacts"),
  registry: {
    type: "sqlite",
    path: join(defaultDataRoot(), "registry", "skillspace.sqlite")
  },
  agents: {
    claude: {
      enabled: true,
      label: "Claude Code",
      command: "claude",
      args: ["--bare", "-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"]
    },
    hermes: {
      enabled: true,
      label: "Hermes Agent",
      command: "wsl",
      args: ["-d", "Ubuntu", "--", "hermes", "-z", "{{prompt}}"]
    },
    openclaw: {
      enabled: true,
      label: "OpenClaw",
      command: "openclaw",
      args: ["agent", "--local", "--message", "{{prompt}}", "--json"]
    },
    codex: {
      enabled: true,
      label: "Codex",
      command: "codex",
      args: [
        "--ask-for-approval",
        "never",
        "exec",
        "--sandbox",
        "danger-full-access",
        "--skip-git-repo-check",
        "--json",
        "{{prompt}}"
      ]
    }
  },
  window: {
    closeToTray: false
  }
};

async function ensureDataDirs(config: SkillSpaceConfig): Promise<void> {
  await Promise.all([
    mkdir(config.dataRoot, { recursive: true }),
    mkdir(config.importRoot, { recursive: true }),
    mkdir(config.runsRoot, { recursive: true }),
    mkdir(config.logsRoot, { recursive: true }),
    mkdir(config.artifactsRoot, { recursive: true }),
    mkdir(scheduleRoot(config), { recursive: true }),
    mkdir(publishRoot(config), { recursive: true }),
    mkdir(marketplaceRoot(config), { recursive: true }),
    mkdir(dirname(config.registry.path), { recursive: true }),
    ...config.skillRoots.map((root) => mkdir(root, { recursive: true }))
  ]);
}

function scheduleRoot(config: SkillSpaceConfig): string {
  return join(config.dataRoot, "automations");
}

function schedulesPath(config: SkillSpaceConfig): string {
  return join(scheduleRoot(config), "tasks.json");
}

function skillChangesPath(config: SkillSpaceConfig): string {
  return join(dirname(config.registry.path), "skill-changes.json");
}

function publishRoot(config: SkillSpaceConfig): string {
  return join(config.dataRoot, "publish");
}

function marketplaceRoot(config: SkillSpaceConfig): string {
  return join(config.dataRoot, "marketplace");
}

function marketplaceCatalogPath(config: SkillSpaceConfig): string {
  return join(marketplaceRoot(config), "catalog.json");
}

function marketplaceShareRoot(config: SkillSpaceConfig): string {
  return join(marketplaceRoot(config), "share");
}

function marketplaceUploadedPath(config: SkillSpaceConfig): string {
  return join(marketplaceRoot(config), "uploaded.json");
}

function backgroundSchedulerScriptPath(config: SkillSpaceConfig): string {
  return join(scheduleRoot(config), "background-scheduler.ps1");
}

function backgroundSchedulerWrapperPath(config: SkillSpaceConfig): string {
  return join(scheduleRoot(config), "background-scheduler.vbs");
}

function schedulerErrorsPath(config: SkillSpaceConfig): string {
  return join(scheduleRoot(config), "scheduler-errors.jsonl");
}

async function appendSchedulerError(
  config: SkillSpaceConfig,
  entry: { phase: string; message: string; taskId?: string; taskName?: string; skillId?: string }
): Promise<void> {
  const next = {
    id: randomUUID(),
    at: new Date().toISOString(),
    ...entry
  };
  await mkdir(dirname(schedulerErrorsPath(config)), { recursive: true });
  await writeFile(schedulerErrorsPath(config), `${JSON.stringify(next)}\n`, { flag: "a" });
}

async function readSchedulerErrors(config: SkillSpaceConfig, limit = 8): Promise<BackgroundSchedulerStatus["recentErrors"]> {
  const path = schedulerErrorsPath(config);
  if (!existsSync(path)) {
    return [];
  }
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-limit)
    .reverse()
    .map((line) => JSON.parse(line) as NonNullable<BackgroundSchedulerStatus["recentErrors"]>[number]);
}

async function ensureConfig(): Promise<SkillSpaceConfig> {
  const configPath = activeConfigPath();
  const shouldMigrateLegacy = !existsSync(configPath) && existsSync(legacyConfigPath);
  const sourcePath = shouldMigrateLegacy ? legacyConfigPath : configPath;

  if (!existsSync(configPath)) {
    if (shouldMigrateLegacy) {
      await mkdir(dirname(configPath), { recursive: true });
      await cp(legacyConfigPath, configPath, { force: false });
    } else {
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(configPath, `${JSON.stringify(fallbackConfig, null, 2)}\n`, "utf8");
      await ensureDataDirs(fallbackConfig);
      closeToTrayEnabled = fallbackConfig.window.closeToTray;
      return fallbackConfig;
    }
  }

  const loaded = JSON.parse(await readFile(sourcePath, "utf8")) as Partial<SkillSpaceConfig>;
  const config: SkillSpaceConfig = {
    ...fallbackConfig,
    ...loaded,
    locale: {
      ...fallbackConfig.locale,
      ...(loaded.locale ?? {})
    },
    registry: {
      ...fallbackConfig.registry,
      ...(loaded.registry ?? {})
    },
    agents: {
      ...fallbackConfig.agents,
      ...(loaded.agents ?? {})
    },
    window: {
      ...fallbackConfig.window,
      ...(loaded.window ?? {})
    }
  };
  closeToTrayEnabled = Boolean(config.window.closeToTray);
  await ensureDataDirs(config);
  return config;
}

async function writeConfig(config: SkillSpaceConfig): Promise<void> {
  const configPath = activeConfigPath();
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  closeToTrayEnabled = Boolean(config.window.closeToTray);
}

async function setCloseToTray(config: SkillSpaceConfig, enabled: boolean): Promise<SkillSpaceConfig> {
  const next = {
    ...config,
    window: {
      ...config.window,
      closeToTray: enabled
    }
  };
  await writeConfig(next);
  if (enabled) {
    ensureTray();
  } else if (tray) {
    tray.destroy();
    tray = null;
  }
  return next;
}

function rebaseDataPath(oldRoot: string, newRoot: string, value: string): string {
  if (resolve(value) === resolve(oldRoot)) {
    return newRoot;
  }
  if (isPathInside(oldRoot, value)) {
    return join(newRoot, relative(resolve(oldRoot), resolve(value)));
  }
  return value;
}

async function copyDataRootChildren(oldRoot: string, newRoot: string): Promise<void> {
  if (resolve(oldRoot) === resolve(newRoot) || isPathInside(oldRoot, newRoot)) {
    return;
  }
  if (!existsSync(oldRoot)) {
    return;
  }

  await mkdir(newRoot, { recursive: true });
  const entries = await readdir(oldRoot, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const source = join(oldRoot, entry.name);
      const destination = join(newRoot, entry.name);
      try {
        await cp(source, destination, { recursive: entry.isDirectory(), force: false, errorOnExist: false });
      } catch {
        // Existing files should not block changing the storage root.
      }
    })
  );
}

async function chooseStorageRoot(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: "Select Skill-Space storage folder",
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
}

async function saveStorageRoot(config: SkillSpaceConfig, request: SaveStorageRootRequest): Promise<BootstrapPayload> {
  const dataRoot = request.dataRoot.trim();
  if (!dataRoot) {
    throw new Error("Storage path cannot be empty.");
  }

  const oldRoot = config.dataRoot;
  const nextRoot = resolve(dataRoot);
  await copyDataRootChildren(oldRoot, nextRoot);

  const nextConfig: SkillSpaceConfig = {
    ...config,
    dataRoot: nextRoot,
    importRoot: rebaseDataPath(oldRoot, nextRoot, config.importRoot),
    runsRoot: rebaseDataPath(oldRoot, nextRoot, config.runsRoot),
    logsRoot: rebaseDataPath(oldRoot, nextRoot, config.logsRoot),
    artifactsRoot: rebaseDataPath(oldRoot, nextRoot, config.artifactsRoot),
    skillRoots: config.skillRoots.map((root) => rebaseDataPath(oldRoot, nextRoot, root)),
    registry: {
      ...config.registry,
      path: rebaseDataPath(oldRoot, nextRoot, config.registry.path)
    }
  };
  await writeConfig(nextConfig);
  await ensureDataDirs(nextConfig);
  return bootstrap();
}

function windowsCommand(command: string): string {
  if (process.platform !== "win32") {
    return command;
  }

  if (command === "wsl" || command.endsWith(".exe") || command.endsWith(".cmd")) {
    return command;
  }

  return `${command}.cmd`;
}

function shouldUseShell(command: string): boolean {
  return process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
}

function runProcess(
  command: string,
  args: string[],
  options: { timeoutMs?: number; cwd?: string; env?: Record<string, string> } = {}
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const executable = windowsCommand(command);
    let child;
    try {
      child = spawn(executable, args, {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        windowsHide: true,
        shell: shouldUseShell(executable)
      });
    } catch (error) {
      resolve({ code: 1, output: error instanceof Error ? error.message : String(error) });
      return;
    }

    let output = "";
    const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 10_000);

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, output: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output: output.trim() });
    });
  });
}

function healthProbe(id: AgentId, agent: AgentConfig): { command?: string; args: string[] } {
  if (!agent.command) {
    return { command: undefined, args: [] };
  }

  if (id === "hermes") {
    const configuredArgs = agent.args ?? fallbackConfig.agents.hermes.args ?? [];
    const promptIndex = configuredArgs.indexOf("{{prompt}}");
    const args =
      promptIndex > 0
        ? [...configuredArgs.slice(0, promptIndex - 1), "--version"]
        : [...configuredArgs, "--version"];
    return {
      command: agent.command,
      args
    };
  }

  return {
    command: agent.command,
    args: ["--version"]
  };
}

async function checkAgent(id: AgentId, agent: AgentConfig): Promise<AgentHealth> {
  const checkedAt = new Date().toISOString();

  if (!agent.enabled) {
    return {
      id,
      label: agent.label,
      enabled: false,
      status: "disabled",
      detail: agent.reason ?? "Disabled in Skill-Space config.",
      command: agent.command,
      checkedAt
    };
  }

  const probe = healthProbe(id, agent);
  if (!probe.command) {
    return {
      id,
      label: agent.label,
      enabled: true,
      status: "offline",
      detail: "Missing command.",
      checkedAt
    };
  }

  const result = await runProcess(probe.command, probe.args, { timeoutMs: 12_000, cwd: agent.cwd, env: agent.env });
  const detail = normalizeAgentDetail(id, result.output, result.code === 0);
  return {
    id,
    label: agent.label,
    enabled: true,
    status: result.code === 0 ? "online" : "offline",
    detail,
    command: probe.command,
    checkedAt
  };
}

function normalizeAgentDetail(id: AgentId, output: string, online: boolean): string {
  const cleanedLine = output
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const unreadableCount = (cleanedLine.match(/[\u95bf\u7199\u8a12\u0412\u93cb\u78b7\ufffd\u25a1]/g) ?? []).length;
  if (!cleanedLine || unreadableCount > 2) {
    return online ? (id === "hermes" ? "WSL Hermes Agent ready" : "Agent ready") : "No readable version output.";
  }
  return cleanedLine.slice(0, 180);
}
async function checkAgents(config: SkillSpaceConfig): Promise<AgentHealth[]> {
  const ids = Object.keys(config.agents) as AgentId[];
  return Promise.all(ids.map((id) => checkAgent(id, config.agents[id])));
}

async function detectAgentCandidates(config: SkillSpaceConfig): Promise<AgentCandidate[]> {
  return Promise.all(
    detectableAgentCandidates.map(async (candidate) => {
      const probe = healthProbe(candidate.id, {
        enabled: true,
        label: candidate.label,
        command: candidate.command,
        args: candidate.args
      });
      const result = probe.command
        ? await runProcess(probe.command, probe.args, { timeoutMs: 8_000 })
        : { code: 1, output: "Missing command." };
      const installed = result.code === 0;
      return {
        ...candidate,
        installed,
        detail: installed ? normalizeAgentDetail(candidate.id, result.output, true) : "未检测到本机命令",
        alreadyConfigured: Boolean(config.agents[candidate.id])
      };
    })
  );
}

function normalizeAgentConfig(agentId: AgentId, previous: AgentConfig, next: AgentConfig): AgentConfig {
  return {
    ...previous,
    ...next,
    label: next.label.trim() || previous.label || agentId,
    command: next.command?.trim() || previous.command,
    args: (next.args ?? previous.args ?? []).map((arg) => arg.trim()).filter(Boolean),
    cwd: next.cwd?.trim() || undefined,
    env: next.env && Object.keys(next.env).length > 0 ? next.env : undefined
  };
}

async function saveAgentConfig(config: SkillSpaceConfig, request: SaveAgentConfigRequest): Promise<BootstrapPayload> {
  if (!/^[a-z0-9][a-z0-9_-]{1,47}$/i.test(request.agentId)) {
    throw new Error(`Invalid agent id: ${request.agentId}`);
  }

  const previous = config.agents[request.agentId] ?? fallbackConfig.agents[request.agentId] ?? {
    enabled: true,
    label: request.agentId
  };
  const nextAgent = normalizeAgentConfig(request.agentId, previous, request.config);

  const nextConfig: SkillSpaceConfig = {
    ...config,
    agents: {
      ...config.agents,
      [request.agentId]: nextAgent
    }
  };
  await writeConfig(nextConfig);
  return bootstrap();
}

async function testAgentConfig(config: SkillSpaceConfig, request: SaveAgentConfigRequest): Promise<AgentHealth> {
  const previous = config.agents[request.agentId] ?? fallbackConfig.agents[request.agentId] ?? {
    enabled: true,
    label: request.agentId
  };
  return checkAgent(request.agentId, normalizeAgentConfig(request.agentId, previous, request.config));
}

async function deleteAgentConfig(config: SkillSpaceConfig, agentId: AgentId): Promise<BootstrapPayload> {
  if (builtInAgentIds.has(agentId)) {
    throw new Error("Built-in agents cannot be deleted.");
  }
  const nextAgents = { ...config.agents };
  delete nextAgents[agentId];
  const nextConfig: SkillSpaceConfig = {
    ...config,
    agents: nextAgents,
    defaultRuntime: config.defaultRuntime === agentId ? "claude" : config.defaultRuntime
  };
  await writeConfig(nextConfig);
  return bootstrap();
}

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }

  return match[1].split(/\r?\n/).reduce<Record<string, string>>((acc, line) => {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) {
      return acc;
    }

    acc[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
    return acc;
  }, {});
}

function slugifySkillName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "imported-skill";
}

async function uniqueSkillRoot(config: SkillSpaceConfig, preferredName: string): Promise<string> {
  const root = config.skillRoots[0];
  const slug = slugifySkillName(preferredName);
  let candidate = join(root, slug);
  let index = 2;

  while (existsSync(candidate)) {
    candidate = join(root, `${slug}-${index}`);
    index += 1;
  }

  return candidate;
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function readTextFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  return (await readJsonFile<T>(path)) ?? undefined;
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function feishuConfigPath(config: SkillSpaceConfig): string {
  return join(config.dataRoot, "config", "feishu.config.json");
}

function feishuConversationPath(config: SkillSpaceConfig): string {
  return join(config.dataRoot, "config", "feishu.conversation.json");
}

function feishuDecisionLogPath(config: SkillSpaceConfig): string {
  return join(config.dataRoot, "logs", "feishu.decisions.json");
}

function llmConfigPath(config: SkillSpaceConfig): string {
  return join(config.dataRoot, "config", "llm.config.json");
}

function encryptSecret(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `safe:${safeStorage.encryptString(value).toString("base64")}`;
  }
  return `plain:${Buffer.from(value, "utf8").toString("base64")}`;
}

function decryptSecret(value: string): string {
  if (value.startsWith("safe:")) {
    return safeStorage.decryptString(Buffer.from(value.slice(5), "base64"));
  }
  if (value.startsWith("plain:")) {
    return Buffer.from(value.slice(6), "base64").toString("utf8");
  }
  return "";
}

async function readFeishuConfig(config: SkillSpaceConfig): Promise<FeishuStoredConfig | null> {
  return readJsonFile<FeishuStoredConfig>(feishuConfigPath(config));
}

async function writeFeishuConfig(config: SkillSpaceConfig, value: FeishuStoredConfig): Promise<void> {
  await writeJsonFile(feishuConfigPath(config), value);
}

async function readLlmConfig(config: SkillSpaceConfig): Promise<LlmStoredConfig | null> {
  return readJsonFile<LlmStoredConfig>(llmConfigPath(config));
}

async function writeLlmConfig(config: SkillSpaceConfig, value: LlmStoredConfig): Promise<void> {
  await writeJsonFile(llmConfigPath(config), value);
}

function defaultLlmConfig(): LlmStoredConfig {
  return {
    schemaVersion: "skillspace.llm.v1",
    enabled: true,
    provider: "claude-code",
    model: "skill-space-steward",
    updatedAt: new Date().toISOString()
  };
}

const llmProviderDefaults: Record<LlmProvider, { model: string; baseUrl?: string; needsApiKey: boolean }> = {
  "claude-code": { model: "skill-space-steward", needsApiKey: false },
  openai: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1", needsApiKey: true },
  deepseek: { model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1", needsApiKey: true },
  qwen: { model: "qwen-plus", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", needsApiKey: true },
  kimi: { model: "moonshot-v1-8k", baseUrl: "https://api.moonshot.cn/v1", needsApiKey: true },
  gemini: { model: "gemini-2.5-flash", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", needsApiKey: true },
  zhipu: { model: "glm-4-flash", baseUrl: "https://open.bigmodel.cn/api/paas/v4", needsApiKey: true },
  volcengine: { model: "doubao-seed-1-6", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", needsApiKey: true },
  siliconflow: { model: "Qwen/Qwen2.5-7B-Instruct", baseUrl: "https://api.siliconflow.cn/v1", needsApiKey: true },
  openrouter: { model: "openai/gpt-4o-mini", baseUrl: "https://openrouter.ai/api/v1", needsApiKey: true },
  groq: { model: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1", needsApiKey: true },
  lmstudio: { model: "local-model", baseUrl: "http://127.0.0.1:1234/v1", needsApiKey: false },
  vllm: { model: "local-model", baseUrl: "http://127.0.0.1:8000/v1", needsApiKey: false },
  ollama: { model: "llama3.1", baseUrl: "http://127.0.0.1:11434", needsApiKey: false },
  "openai-compatible": { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1", needsApiKey: true }
};

function llmStatusFromConfig(stored: LlmStoredConfig | null): LlmManagerStatus {
  const current = stored ?? defaultLlmConfig();
  const defaults = llmProviderDefaults[current.provider] ?? llmProviderDefaults["openai-compatible"];
  const configured =
    current.provider === "claude-code" ||
    current.provider === "ollama" ||
    !defaults.needsApiKey ||
    Boolean(current.encryptedApiKey && current.baseUrl && current.model);
  return {
    enabled: current.enabled,
    configured,
    provider: current.provider,
    model: current.model,
    baseUrl: current.baseUrl,
    identity: "Skill-Space 管家",
    detail: current.enabled
      ? configured
        ? "Skill-Space 管家已就绪，会理解技能库、运行历史、自动化和飞书协同上下文。"
        : "请补全模型配置后启用 Skill-Space 管家。"
      : "Skill-Space 管家已关闭，应用会使用规则逻辑兜底。"
  };
}

function feishuStatusFromConfig(stored: FeishuStoredConfig | null): FeishuStatus {
  const configured = Boolean(stored?.appId && stored.encryptedAppSecret);
  const enabled = Boolean(stored?.enabled);
  const connected = enabled && configured && feishuRuntimeState === "connected";
  const state: FeishuStatus["state"] = !enabled
    ? "disabled"
    : !configured
      ? "not_configured"
      : feishuRuntimeState;

  const detail =
    state === "connected"
      ? "飞书长连接已就绪，可以接收指令并推送运行状态。"
      : state === "connecting"
        ? "等待手机飞书扫码授权或正在建立长连接。"
        : state === "error"
          ? feishuLastError ?? "飞书连接异常。"
          : state === "disabled"
            ? "飞书通信已关闭。"
            : "尚未配置飞书应用，请扫码连接或手动保存应用信息。";

  return {
    enabled,
    configured,
    connected,
    state,
    detail,
    appId: stored?.appId,
    receiveId: stored?.receiveId,
    receiveIdType: stored?.receiveIdType ?? "open_id",
    ...feishuQrState,
    lastEventAt: feishuLastInboundAt,
    lastOutboundAt: feishuLastOutboundAt,
    deliveryStatus: feishuDeliveryStatus,
    deliveryDetail: feishuDeliveryDetail,
    lastInboundText: feishuLastInboundText,
    lastInboundSender: feishuLastInboundSender,
    lastReplyPreview: feishuLastReplyPreview,
    lastReplyAt: feishuLastReplyAt,
    processing: feishuProcessing,
    lastError: feishuLastError,
    canSend: Boolean(enabled && configured && stored?.receiveId)
  };
}

async function getFeishuStatus(config: SkillSpaceConfig): Promise<FeishuStatus> {
  return feishuStatusFromConfig(await readFeishuConfig(config));
}

async function createFeishuChannel(stored: FeishuStoredConfig): Promise<FeishuChannelLike> {
  const lark = await import("@larksuiteoapi/node-sdk");
  return lark.createLarkChannel({
    appId: stored.appId,
    appSecret: decryptSecret(stored.encryptedAppSecret),
    transport: "websocket",
    policy: {
      dmMode: "open",
      requireMention: false
    }
  }) as FeishuChannelLike;
}

async function ensureFeishuChannel(config: SkillSpaceConfig): Promise<void> {
  const stored = await readFeishuConfig(config);
  if (!stored?.enabled || !stored.appId || !stored.encryptedAppSecret) {
    feishuRuntimeState = stored?.enabled ? "not_configured" : "disabled";
    return;
  }
  if (feishuRuntimeState === "connected" || feishuRuntimeState === "connecting") {
    return;
  }

  feishuRuntimeState = "connecting";
  feishuLastError = undefined;
  try {
    feishuChannel = await createFeishuChannel(stored);
    feishuChannel?.on?.("message", (message: unknown) => {
      feishuLastInboundAt = new Date().toISOString();
      feishuDeliveryStatus = "received";
      feishuDeliveryDetail = "已收到飞书消息，正在交给 Skill-Space 管家处理。";
      feishuLastError = undefined;
      void handleFeishuMessage(config, message).catch((error: unknown) => {
        feishuLastError = error instanceof Error ? error.message : String(error);
        feishuDeliveryStatus = "failed";
        feishuDeliveryDetail = feishuLastError;
        feishuProcessing = false;
      });
    });
    feishuChannel?.on?.("error", (error: unknown) => {
      feishuRuntimeState = "error";
      feishuLastError = error instanceof Error ? error.message : String(error);
    });
    await feishuChannel?.connect?.();
    feishuRuntimeState = "connected";
  } catch (error) {
    feishuRuntimeState = "error";
    feishuLastError = error instanceof Error ? error.message : String(error);
  }
}

async function disconnectFeishuChannel(): Promise<void> {
  try {
    await feishuChannel?.disconnect?.();
  } catch {
    // Closing a stale websocket should not block disabling Feishu.
  }
  feishuChannel = null;
}

async function startFeishuConnect(
  config: SkillSpaceConfig,
  request: { domain?: "feishu" | "lark" } = {}
): Promise<FeishuStatus> {
  const lark = await import("@larksuiteoapi/node-sdk");
  feishuRegisterController?.abort();
  feishuRegisterController = new AbortController();
  feishuRuntimeState = "connecting";
  feishuLastError = undefined;
  feishuQrState = {};

  const qrReady = new Promise<void>((resolveQr) => {
    void lark
      .registerApp({
        domain: request.domain === "lark" ? "accounts.larksuite.com" : "accounts.feishu.cn",
        source: "Skill-Space",
        signal: feishuRegisterController?.signal,
        onQRCodeReady: async (info: { url: string; expireIn: number }) => {
          feishuQrState = {
            qrUrl: info.url,
            qrDataUrl: await QRCode.toDataURL(info.url, { margin: 1, width: 220 }),
            qrExpiresAt: new Date(Date.now() + info.expireIn * 1000).toISOString()
          };
          resolveQr();
        },
        onStatusChange: () => {
          feishuRuntimeState = "connecting";
        }
      })
      .then(async (result) => {
        const now = new Date().toISOString();
        await writeFeishuConfig(config, {
          schemaVersion: "skillspace.feishu.v1",
          enabled: true,
          appId: result.client_id,
          encryptedAppSecret: encryptSecret(result.client_secret),
          receiveId: result.user_info?.open_id,
          receiveIdType: "open_id",
          createdAt: now,
          updatedAt: now
        });
        feishuQrState = {};
        await disconnectFeishuChannel();
        feishuRuntimeState = "not_configured";
        void ensureFeishuChannel(config);
      })
      .catch((error) => {
        if (feishuRegisterController?.signal.aborted) {
          return;
        }
        feishuRuntimeState = "error";
        feishuLastError = error instanceof Error ? error.message : String(error);
        resolveQr();
      });
  });

  await Promise.race([qrReady, new Promise((resolve) => setTimeout(resolve, 4_000))]);

  return getFeishuStatus(config);
}

async function saveFeishuConfig(config: SkillSpaceConfig, request: SaveFeishuConfigRequest): Promise<FeishuStatus> {
  const existing = await readFeishuConfig(config);
  const now = new Date().toISOString();
  if (!request.appId.trim()) {
    throw new Error("Feishu appId is required.");
  }
  if (!request.appSecret?.trim() && !existing?.encryptedAppSecret) {
    throw new Error("Feishu appSecret is required.");
  }
  await writeFeishuConfig(config, {
    schemaVersion: "skillspace.feishu.v1",
    enabled: request.enabled,
    appId: request.appId.trim(),
    encryptedAppSecret: request.appSecret?.trim()
      ? encryptSecret(request.appSecret.trim())
      : existing?.encryptedAppSecret ?? "",
    receiveId: request.receiveId?.trim() || existing?.receiveId,
    receiveIdType: request.receiveIdType,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });
  await disconnectFeishuChannel();
  feishuRuntimeState = request.enabled ? "not_configured" : "disabled";
  if (request.enabled) {
    void ensureFeishuChannel(config);
  }
  return getFeishuStatus(config);
}

async function setFeishuEnabled(config: SkillSpaceConfig, enabled: boolean): Promise<FeishuStatus> {
  const existing = await readFeishuConfig(config);
  if (!existing) {
    feishuRuntimeState = enabled ? "not_configured" : "disabled";
    return getFeishuStatus(config);
  }

  await writeFeishuConfig(config, {
    ...existing,
    enabled,
    updatedAt: new Date().toISOString()
  });
  if (!enabled) {
    await disconnectFeishuChannel();
    feishuRuntimeState = "disabled";
  } else {
    feishuRuntimeState = "not_configured";
    void ensureFeishuChannel(config);
  }
  return getFeishuStatus(config);
}

async function sendFeishuText(config: SkillSpaceConfig, text: string): Promise<boolean> {
  const stored = await readFeishuConfig(config);
  if (!stored?.enabled || !stored.receiveId) {
    return false;
  }

  const chunks = splitFeishuText(text, feishuMessageChunkLimit);
  feishuDeliveryStatus = "sending";
  feishuDeliveryDetail = "正在发送飞书消息。";
  try {
    if (!feishuChannel || feishuRuntimeState !== "connected") {
      await ensureFeishuChannel(config);
    }
    if (feishuChannel?.send && feishuRuntimeState === "connected") {
      for (const chunk of chunks) {
        await feishuChannel.send(stored.receiveId, { text: chunk });
      }
      feishuLastOutboundAt = new Date().toISOString();
      feishuDeliveryStatus = "sent";
      feishuDeliveryDetail = "飞书消息已发送。";
      return true;
    }

    const lark = await import("@larksuiteoapi/node-sdk");
    const client = new lark.Client({
      appId: stored.appId,
      appSecret: decryptSecret(stored.encryptedAppSecret),
      domain: lark.Domain.Feishu
    });
    for (const chunk of chunks) {
      await client.im.v1.message.create({
        params: { receive_id_type: stored.receiveIdType },
        data: {
          receive_id: stored.receiveId,
          msg_type: "text",
          content: JSON.stringify({ text: chunk })
        }
      });
    }
    feishuLastOutboundAt = new Date().toISOString();
    feishuDeliveryStatus = "sent";
    feishuDeliveryDetail = "飞书消息已发送。";
    return true;
  } catch (error) {
    feishuRuntimeState = "error";
    feishuLastError = error instanceof Error ? error.message : String(error);
    feishuDeliveryStatus = "failed";
    feishuDeliveryDetail = feishuLastError;
    return false;
  }
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .trim();
}

function markdownTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => stripInlineMarkdown(cell.trim()))
    .filter((cell) => cell.length > 0);
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function markdownTableBlockToText(lines: string[]): string[] {
  const separatorIndex = lines.findIndex(isMarkdownTableSeparator);
  if (separatorIndex <= 0) {
    return lines;
  }

  const headers = markdownTableCells(lines[separatorIndex - 1]);
  const rows = lines.slice(separatorIndex + 1).map(markdownTableCells).filter((cells) => cells.length > 0);
  if (headers.length === 0 || rows.length === 0) {
    return lines;
  }

  return rows.map((cells) => {
    if (headers.length === 2 && cells.length >= 2) {
      return `- ${cells[0]}：${cells[1]}`;
    }
    const pairs = cells
      .map((cell, index) => {
        const header = headers[index] || `字段${index + 1}`;
        return `${header}：${cell}`;
      })
      .join("；");
    return `- ${pairs}`;
  });
}

function formatFeishuOutboundMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1])) {
      const tableLines = [lines[index], lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }
      output.push(...markdownTableBlockToText(tableLines));
      index -= 1;
      continue;
    }
    output.push(lines[index]);
  }
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitFeishuText(value: string, limit = feishuMessageChunkLimit): string[] {
  const text = value.trim();
  if (!text) {
    return [""];
  }
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let current = "";
  const lines = text.split("\n");
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= limit) {
      current = next;
      continue;
    }
    if (current) {
      chunks.push(current);
      current = "";
    }
    if (line.length <= limit) {
      current = line;
      continue;
    }
    for (let index = 0; index < line.length; index += limit) {
      chunks.push(line.slice(index, index + limit));
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function formatFeishuNoticeLine(line: string): string[] {
  const lines = formatFeishuOutboundMarkdown(line).split("\n").filter(Boolean);
  return lines.map((item, index) => (index === 0 ? `- ${item}` : `  ${item}`));
}

async function sendFeishuMarkdown(config: SkillSpaceConfig, markdown: string): Promise<boolean> {
  const stored = await readFeishuConfig(config);
  if (!stored?.enabled || !stored.receiveId) {
    return false;
  }

  const outboundMarkdown = formatFeishuOutboundMarkdown(markdown);
  const chunks = splitFeishuText(outboundMarkdown, feishuMessageChunkLimit);
  feishuDeliveryStatus = "sending";
  feishuDeliveryDetail = "正在发送飞书消息。";
  try {
    if (!feishuChannel || feishuRuntimeState !== "connected") {
      await ensureFeishuChannel(config);
    }
    if (feishuChannel?.send && feishuRuntimeState === "connected") {
      for (const chunk of chunks) {
        await feishuChannel.send(stored.receiveId, { markdown: chunk });
      }
      feishuLastOutboundAt = new Date().toISOString();
      feishuDeliveryStatus = "sent";
      feishuDeliveryDetail = "飞书消息已发送。";
      return true;
    }
    return sendFeishuText(config, stripInlineMarkdown(outboundMarkdown));
  } catch (error) {
    feishuRuntimeState = "error";
    feishuLastError = error instanceof Error ? error.message : String(error);
    feishuDeliveryStatus = "failed";
    feishuDeliveryDetail = feishuLastError;
    return false;
  }
}

async function sendFeishuTest(config: SkillSpaceConfig, message?: string): Promise<FeishuStatus> {
  const sentAt = formatFeishuTime(new Date());
  await sendFeishuMarkdown(
    config,
    message?.trim() ||
      [
        "**Skill-Space 通信测试**",
        "",
        `发送时间：${sentAt}`,
        "状态：连接可用",
        "",
        "手机端可以接收任务状态、发送 /skill 指令，也可以在任务等待确认时直接回复选项。"
      ].join("\n")
  );
  return getFeishuStatus(config);
}

function formatFeishuTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function feishuStatusLabel(status: RunSummary["status"]): string {
  const labels: Record<RunSummary["status"], string> = {
    running: "运行中",
    waiting_input: "等待确认",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    unknown: "未知"
  };
  return labels[status] ?? status;
}

type FeishuReplyKind = "steward" | "task" | "system";

class FeishuPartialSendError extends Error {
  sentChunks: number;

  constructor(message: string, sentChunks: number) {
    super(message);
    this.name = "FeishuPartialSendError";
    this.sentChunks = sentChunks;
  }
}

function feishuReplyTitle(kind: FeishuReplyKind, title?: string): string {
  const labels: Record<FeishuReplyKind, string> = {
    steward: "管家回复",
    task: "任务回复",
    system: "系统通知"
  };
  return `**Skill-Space · ${labels[kind]}${title ? ` | ${title}` : ""}**`;
}

function wrapFeishuReply(text: string, kind: FeishuReplyKind, title?: string): string {
  return [feishuReplyTitle(kind, title), "", `发送时间：${formatFeishuTime(new Date())}`, "", text].join("\n");
}

async function notifyFeishuRun(config: SkillSpaceConfig, title: string, lines: string[]): Promise<void> {
  const needsConfirmation =
    title.includes("\u786e\u8ba4") || title.toLowerCase().includes("confirm") || title.includes("\u9700\u8981");
  const message = [
    feishuReplyTitle("system", title),
    "",
    `\u53d1\u9001\u65f6\u95f4\uff1a${formatFeishuTime(new Date())}`,
    ...lines.filter(Boolean).flatMap(formatFeishuNoticeLine),
    "",
    needsConfirmation
      ? "\u8bf7\u76f4\u63a5\u56de\u590d\u9009\u9879\u7f16\u53f7\u6216\u786e\u8ba4\u5185\u5bb9\uff0c\u4f8b\u5982\uff1a1\u3001A\u3001\u7528\u65b9\u6848B\u3001\u786e\u8ba4\u53d1\u5e03\u3002"
      : "\u53ef\u53d1\u9001 /skill status \u67e5\u770b\u6700\u8fd1\u8fd0\u884c\u3002"
  ].join("\n");
  await sendFeishuMarkdown(config, message);
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function nestedRecord(source: Record<string, unknown>, key: string): Record<string, unknown> {
  return asRecord(source[key]);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function extractFeishuMessageText(rawMessage: unknown): string {
  const message = asRecord(rawMessage);
  const rawEvent = nestedRecord(message, "event");
  const rawMessageBody = nestedRecord(message, "message");
  const eventMessageBody = nestedRecord(rawEvent, "message");
  const raw = firstString(message.content, message.text, rawMessageBody.content, eventMessageBody.content) ?? "";
  if (!raw) {
    return "";
  }

  try {
    const parsed = JSON.parse(raw) as { text?: string; content?: string };
    return String(parsed.text ?? parsed.content ?? raw).trim();
  } catch {
    return raw;
  }
}

function extractFeishuMessageId(rawMessage: unknown): string | undefined {
  const message = asRecord(rawMessage);
  const rawEvent = nestedRecord(message, "event");
  const rawMessageBody = nestedRecord(message, "message");
  const eventMessageBody = nestedRecord(rawEvent, "message");
  return firstString(
    message.messageId,
    message.message_id,
    message.id,
    rawMessageBody.message_id,
    rawMessageBody.messageId,
    rawMessageBody.id,
    eventMessageBody.message_id,
    eventMessageBody.messageId,
    eventMessageBody.id
  );
}

function extractFeishuSendMessageId(result: unknown): string | undefined {
  const record = asRecord(result);
  const data = nestedRecord(record, "data");
  return firstString(record.messageId, record.message_id, data.message_id, data.messageId);
}

function extractFeishuMessageTarget(rawMessage: unknown, stored: FeishuStoredConfig | null): string | undefined {
  const message = asRecord(rawMessage);
  const rawEvent = nestedRecord(message, "event");
  const rawMessageBody = nestedRecord(message, "message");
  const eventMessageBody = nestedRecord(rawEvent, "message");
  const rawSender = nestedRecord(message, "sender");
  const eventSender = nestedRecord(rawEvent, "sender");
  const rawSenderId = nestedRecord(rawSender, "sender_id");
  const eventSenderId = nestedRecord(eventSender, "sender_id");

  return firstString(
    message.chatId,
    message.chat_id,
    rawMessageBody.chat_id,
    eventMessageBody.chat_id,
    message.senderId,
    message.sender_id,
    rawSenderId.open_id,
    eventSenderId.open_id,
    stored?.receiveId
  );
}

function extractFeishuSenderId(rawMessage: unknown): string | undefined {
  const message = asRecord(rawMessage);
  const rawEvent = nestedRecord(message, "event");
  const rawSender = nestedRecord(message, "sender");
  const eventSender = nestedRecord(rawEvent, "sender");
  const rawSenderId = nestedRecord(rawSender, "sender_id");
  const eventSenderId = nestedRecord(eventSender, "sender_id");
  return firstString(
    message.senderId,
    message.sender_id,
    message.senderOpenId,
    message.sender_id_open_id,
    rawSenderId.open_id,
    eventSenderId.open_id
  );
}

function extractFeishuMessageType(rawMessage: unknown): string | undefined {
  const message = asRecord(rawMessage);
  const rawEvent = nestedRecord(message, "event");
  const rawMessageBody = nestedRecord(message, "message");
  const eventMessageBody = nestedRecord(rawEvent, "message");
  return firstString(
    message.rawContentType,
    message.messageType,
    message.message_type,
    message.msgType,
    message.msg_type,
    rawMessageBody.message_type,
    rawMessageBody.msg_type,
    eventMessageBody.message_type,
    eventMessageBody.msg_type
  )?.toLowerCase();
}

function extractFeishuMessageCreateTime(rawMessage: unknown): string | undefined {
  const message = asRecord(rawMessage);
  const rawEvent = nestedRecord(message, "event");
  const eventMessage = nestedRecord(rawEvent, "message");
  return firstString(message.create_time, message.createTime, eventMessage.create_time, eventMessage.createTime);
}

function isRecentlyHandledFeishuMessage(messageId: string | undefined, fallbackKey?: string): boolean {
  const key = messageId || fallbackKey;
  if (!key) {
    return false;
  }
  const now = Date.now();
  for (const [id, expiresAt] of feishuHandledMessageIds) {
    if (expiresAt <= now) {
      feishuHandledMessageIds.delete(id);
    }
  }
  if (feishuHandledMessageIds.has(key)) {
    return true;
  }
  feishuHandledMessageIds.set(key, now + 10 * 60_000);
  return false;
}

function shouldIgnoreFeishuMessage(rawMessage: unknown, content: string, messageId: string | undefined): boolean {
  const senderId = extractFeishuSenderId(rawMessage);
  const createdAt = extractFeishuMessageCreateTime(rawMessage) ?? String(Math.floor(Date.now() / 30_000));
  const fallbackKey =
    !messageId && content.trim()
      ? createHash("sha256")
          .update(`${senderId ?? "unknown"}:${createdAt}:${stripInlineMarkdown(content).trim().slice(0, 500)}`)
          .digest("hex")
      : undefined;
  if (isRecentlyHandledFeishuMessage(messageId, fallbackKey)) {
    return true;
  }

  const botOpenId = feishuChannel?.botIdentity?.openId;
  if (senderId && botOpenId && senderId === botOpenId) {
    return true;
  }

  const messageType = extractFeishuMessageType(rawMessage);
  const normalizedContent = stripInlineMarkdown(content);
  if (
    (messageType === "post" || messageType === "interactive") &&
    (/^Skill-Space\s*[·|]/i.test(normalizedContent) || /发送时间：/.test(normalizedContent))
  ) {
    return true;
  }
  return false;
}

function feishuRichPost(title: string, text: string): object {
  const content = formatFeishuOutboundMarkdown(text)
    .split("\n")
    .map((line) => [{ tag: "text", text: line || " " }]);
  return {
    zh_cn: {
      title,
      content
    }
  };
}

function feishuReplyPlainTitle(kind: FeishuReplyKind, title?: string): string {
  const labels: Record<FeishuReplyKind, string> = {
    steward: "管家回复",
    task: "任务回复",
    system: "系统通知"
  };
  return `Skill-Space · ${labels[kind]}${title ? ` | ${title}` : ""}`;
}

async function updateFeishuPostMessage(messageId: string, title: string, text: string): Promise<void> {
  if (feishuChannel?.rawClient?.im?.v1?.message?.update) {
    await feishuChannel.rawClient.im.v1.message.update({
      path: { message_id: messageId },
      data: {
        msg_type: "post",
        content: JSON.stringify(feishuRichPost(title, text))
      }
    });
    return;
  }
  await feishuChannel?.editMessage?.(messageId, stripInlineMarkdown(text));
}

async function addFeishuProcessingReaction(messageId: string): Promise<boolean> {
  if (!feishuChannel?.addReaction) {
    return false;
  }

  for (const emojiType of feishuReceiptEmojiCandidates) {
    try {
      await feishuChannel.addReaction(messageId, emojiType);
      return true;
    } catch {
      // Feishu tenants may expose different emoji identifiers, so try the next known value.
    }
  }
  return false;
}

function feishuPostBodyWithoutDuplicateTitle(outbound: string): string {
  return formatFeishuOutboundMarkdown(outbound)
    .replace(/^\*\*Skill-Space\s*·\s*.+?\*\*\s*\n+/i, "")
    .trim();
}

async function sendFeishuPostReplyChunks(
  target: string,
  inboundMessageId: string | undefined,
  title: string,
  outbound: string
): Promise<number> {
  if (!feishuChannel?.send) {
    throw new Error("Feishu channel is not connected.");
  }

  const bodyChunks = splitFeishuText(feishuPostBodyWithoutDuplicateTitle(outbound), feishuMessageChunkLimit);
  const total = bodyChunks.length;
  let sentChunks = 0;
  for (let index = 0; index < total; index += 1) {
    const chunkTitle = total > 1 ? `${title} (${index + 1}/${total})` : title;
    const chunkBody = index === 0 ? bodyChunks[index] : [`续 ${index + 1}/${total}`, "", bodyChunks[index]].join("\n");
    try {
      await feishuChannel.send(
        target,
        { post: feishuRichPost(chunkTitle, chunkBody) },
        inboundMessageId ? { replyTo: inboundMessageId, replyInThread: false } : undefined
      );
      sentChunks += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new FeishuPartialSendError(message, sentChunks);
    }
  }
  return sentChunks;
}

function extractFeishuSenderName(rawMessage: unknown): string {
  const message = asRecord(rawMessage);
  const rawEvent = nestedRecord(message, "event");
  const rawSender = nestedRecord(message, "sender");
  const eventSender = nestedRecord(rawEvent, "sender");
  const rawSenderId = nestedRecord(rawSender, "sender_id");
  const eventSenderId = nestedRecord(eventSender, "sender_id");
  return (
    firstString(
      message.senderName,
      message.sender_name,
      rawSender.name,
      eventSender.name,
      rawSenderId.open_id,
      eventSenderId.open_id
    ) ?? "Feishu"
  );
}

function feishuAgentLabel(config: SkillSpaceConfig): string {
  const agent = config.agents[config.defaultRuntime] ?? config.agents.claude;
  return agent?.label || "Claude Code";
}

async function findWaitingRun(config: SkillSpaceConfig): Promise<RunSummary | null> {
  const waitingRuns = await listWaitingRuns(config);
  return waitingRuns[0] ?? null;
}

async function listWaitingRuns(config: SkillSpaceConfig): Promise<RunSummary[]> {
  const runs = await listRuns(config);
  return runs.filter((run) => run.status === "waiting_input" && run.runtime === "claude" && Boolean(run.sessionId));
}

function isLikelyWaitingRunReply(content: string): boolean {
  const text = content.trim();
  if (!text) {
    return false;
  }
  if (looksLikeSkillRunRequest(text)) {
    return false;
  }
  if (/^Skill-Space\s*[·|]/i.test(stripInlineMarkdown(text))) {
    return false;
  }
  if (/^(你好|您好|hi|hello|hey|在吗|现在几点|几点了|你是谁|你能做什么)[？?。！!,.，\s]*$/i.test(text)) {
    return false;
  }
  if (/[？?]/.test(text) || /(?:什么|怎么|为什么|几点|多少|介绍|说明|帮我看看)/.test(text)) {
    return false;
  }
  return [
    /^[A-Ea-e]$/,
    /^[1-9]$/,
    /^(?:方案|选项)?[A-Ea-e]$/,
    /^(?:第)?[一二三四五六七八九\d]+(?:个|项|条|题|号|方案)?$/,
    /^(?:确认|同意|可以|继续|通过|批准|发布|完成|没问题|选|选择|用|采用|按|就).{0,60}$/i,
    /(?:确认|选择|采用|用|选).{0,24}(?:方案|选题|第|[A-Ea-e]|[1-9])/i
  ].some((pattern) => pattern.test(text));
}

function looksLikeSkillRunRequest(content: string): boolean {
  const text = content.trim();
  return [
    /(?:执行|运行|启动|调用|打开|添加|新增|安装).{0,16}(?:第?\s*[1-9一二两三四五六七八九]\s*个?)?技能/i,
    /(?:执行|运行|启动|调用|打开|添加|新增|安装).{0,16}(?:skill|workflow|工作流)/i,
    /第\s*[1-9一二两三四五六七八九]\s*个技能/i,
    /^\/skill\s+run\b/i
  ].some((pattern) => pattern.test(text));
}

function summarizeWaitingRun(run: RunSummary): string {
  const message = formatWaitingMessagePreview(run, 1_200);
  return [`任务：${run.skillName}`, `运行 ID：${run.runId}`, `等待事项：${message}`].join("\n");
}

function summarizeWaitingRuns(runs: RunSummary[]): string {
  if (runs.length === 0) {
    return "无";
  }
  return runs
    .slice(0, 8)
    .map((run, index) => summarizeWaitingRunBrief(run, index))
    .join("\n\n");
}

function chineseChoiceToNumber(value: string): string | undefined {
  const direct = value.match(/[1-9]/)?.[0];
  if (direct) {
    return direct;
  }
  const map: Record<string, string> = {
    一: "1",
    二: "2",
    两: "2",
    三: "3",
    四: "4",
    五: "5",
    六: "6",
    七: "7",
    八: "8",
    九: "9"
  };
  const match = value.match(/[一二两三四五六七八九]/)?.[0];
  return match ? map[match] : undefined;
}

function extractWaitingChoiceNumber(content: string): string | undefined {
  const text = content.trim();
  if (looksLikeSkillRunRequest(text)) {
    return undefined;
  }
  const explicit =
    text.match(/(?:选题|选项|方案|选择|采用|用|按|就|第)\s*([1-9一二两三四五六七八九])\s*(?:个|项|条|题|号|方案)?/i) ??
    text.match(/^([1-9一二两三四五六七八九])$/);
  return explicit ? chineseChoiceToNumber(explicit[1]) : undefined;
}

function waitingRunHasNumberedChoices(run: RunSummary): boolean {
  const message = run.lastMessage ?? "";
  return /(?:回复数字\s*1-5|选题编号|候选选题|【[1-9]】|[1-9][.、]\s|[1-9]️⃣)/.test(message);
}

function extractWaitingOptions(message: string): string[] {
  const options: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /(?:^|\n)\s*(?:\*\*)?【([1-9])】(.+?)(?:\*\*)?(?=\n|$)/g,
    /(?:^|\n)\s*([1-9])[.、]\s*(.+?)(?=\n|$)/g,
    /(?:^|\n)\s*([1-9])️⃣\s*(.+?)(?=\n|$)/g
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(message)) && options.length < 9) {
      const index = match[1];
      const title = stripInlineMarkdown(match[2] ?? "")
        .replace(/^[：:\s-]+/, "")
        .trim()
        .slice(0, 80);
      if (!title || seen.has(index)) {
        continue;
      }
      seen.add(index);
      options.push(`${index}. ${title}`);
    }
  }
  return options;
}

function formatWaitingMessagePreview(run: RunSummary, limit = 700): string {
  const options = extractWaitingOptions(run.lastMessage ?? "");
  if (options.length > 0) {
    return ["可选项：", ...options].join("\n");
  }
  return formatFeishuOutboundMarkdown(truncateForLog(run.lastMessage ?? "等待确认", limit))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join("\n");
}

function summarizeWaitingRunBrief(run: RunSummary, index: number): string {
  const shortId = run.runId.slice(0, 8);
  const preview = formatWaitingMessagePreview(run, 500)
    .split("\n")
    .slice(0, 8)
    .map((line) => `  ${line}`)
    .join("\n");
  return [`任务${index + 1}：${run.skillName} (${shortId})`, preview].filter(Boolean).join("\n");
}

function normalizeWaitingReplyForRun(reply: string, run: RunSummary): string {
  const choice = extractWaitingChoiceNumber(reply);
  if (choice && waitingRunHasNumberedChoices(run)) {
    return choice;
  }
  return reply.trim();
}

function pickWaitingRunReply(content: string, runs: RunSummary[]): { run: RunSummary; reply: string } | null {
  const text = content.trim();
  if (looksLikeSkillRunRequest(text) && !/^(?:任务|task|run|回复)/i.test(text)) {
    return null;
  }
  const match =
    text.match(/^(?:任务|task|run)\s*([a-f0-9-]{8,}|[0-9]+)\s*(?:的)?\s*(?:选题|选项|方案|选择|确认|回复|用|采用|按)?\s*[:：,\s-]?\s*(.+)$/i) ??
    text.match(/^回复(?:任务)?\s*([a-f0-9-]{8,}|[0-9]+)\s*(?:的)?\s*(?:选题|选项|方案|选择|确认)?\s*[:：,\s-]?\s*(.+)$/i);
  if (!match) {
    return null;
  }
  const token = match[1];
  const reply = match[2]?.trim();
  if (!reply) {
    return null;
  }
  const run =
    (/^\d+$/.test(token) ? runs[Number(token) - 1] : undefined) ??
    runs.find((item) => item.runId.toLowerCase().startsWith(token.toLowerCase()));
  return run ? { run, reply: normalizeWaitingReplyForRun(reply, run) } : null;
}

function pickNumberedChoiceWaitingRun(content: string, runs: RunSummary[]): { run: RunSummary; reply: string } | null {
  const choice = extractWaitingChoiceNumber(content);
  if (!choice) {
    return null;
  }
  const candidates = runs.filter(waitingRunHasNumberedChoices);
  if (candidates.length === 0) {
    return null;
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const text = content.toLowerCase();
  const scored = candidates
    .map((run, index) => {
      const message = run.lastMessage ?? "";
      const score =
        (message.includes(today) ? 8 : 0) +
        (/今日|今天|选题|公众号|北陌|文章/.test(content) && /今日|今天|选题|公众号|文章/.test(message) ? 6 : 0) +
        (text.includes(run.skillName.toLowerCase()) ? 5 : 0) +
        Math.max(0, 5 - index);
      return { run, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1 || scored[0].score > scored[1].score) {
    return { run: scored[0].run, reply: choice };
  }
  return null;
}

function pickResolvedWaitingRunReply(content: string, runs: RunSummary[]): { run: RunSummary; reply: string; reason: string } | null {
  if (looksLikeSkillRunRequest(content) && !/^(?:任务|task|run|回复)/i.test(content.trim())) {
    return null;
  }
  const explicit = pickWaitingRunReply(content, runs);
  if (explicit) {
    return { ...explicit, reason: "用户明确指定了等待任务编号或运行 ID。" };
  }
  const numbered = pickNumberedChoiceWaitingRun(content, runs);
  if (numbered) {
    return { ...numbered, reason: "根据选题编号和等待任务内容自动匹配到最相关任务。" };
  }
  return null;
}

function isGenericWaitingConfirmation(content: string): boolean {
  return /^(?:确认|同意|可以|继续|通过|批准|发布|完成|没问题|行|好|ok|yes|y)[。！!,.，\s]*$/i.test(content.trim());
}

function resolveIntentWaitingRun(
  intent: FeishuIntent,
  waitingRuns: RunSummary[]
): { run: RunSummary; reply: string; reason: string } | null {
  if (intent.action !== "reply_waiting") {
    return null;
  }
  if (looksLikeSkillRunRequest(intent.input ?? intent.reply ?? intent.waitingReply ?? "")) {
    return null;
  }
  const run =
    (typeof intent.runIndex === "number" ? waitingRuns[intent.runIndex - 1] : undefined) ??
    (intent.runId ? waitingRuns.find((item) => item.runId.toLowerCase().startsWith(intent.runId!.toLowerCase())) : undefined);
  const rawReply = intent.waitingReply?.trim() || intent.reply?.trim() || intent.input?.trim();
  if (!run || !rawReply) {
    return null;
  }
  return {
    run,
    reply: normalizeWaitingReplyForRun(rawReply, run),
    reason: "LLM 管家根据上下文判断这是等待任务回复，并通过安全校验。"
  };
}

function formatWaitingRunChoices(runs: RunSummary[]): string {
  return [
    "当前有多个任务在等待确认，我需要先知道你要回复哪一个：",
    "",
    summarizeWaitingRuns(runs),
    "",
    "回复示例：任务2：选题4 / 任务1：确认 / run 1234abcd: 方案B"
  ].join("\n");
}

function normalizeForSearch(value: string): string {
  return value.toLowerCase().replace(/[\s_\-.:：、，。/\\]+/g, "");
}

function findSkillByText(skills: SkillSummary[], text: string, explicitToken?: string): SkillSummary | undefined {
  const tokens = [explicitToken, text].filter((item): item is string => Boolean(item?.trim()));
  for (const token of tokens) {
    const raw = token.trim().toLowerCase();
    const normalized = normalizeForSearch(token);
    const exact = skills.find((skill) => {
      const id = skill.id.toLowerCase();
      const name = skill.name.toLowerCase();
      return id === raw || name === raw || normalizeForSearch(skill.id) === normalized || normalizeForSearch(skill.name) === normalized;
    });
    if (exact) {
      return exact;
    }
  }

  const normalizedText = normalizeForSearch(text);
  return skills.find((skill) => {
    const id = normalizeForSearch(skill.id);
    const name = normalizeForSearch(skill.name);
    return (id.length > 2 && normalizedText.includes(id)) || (name.length > 2 && normalizedText.includes(name));
  });
}

function formatFeishuSkillList(skills: SkillSummary[]): string {
  if (skills.length === 0) {
    return "暂无可执行技能。";
  }
  return skills
    .slice(0, 12)
    .map((skill, index) => `${index + 1}. ${skill.name} (${skill.id})\n${skill.description || "暂无说明"}`)
    .join("\n\n");
}

function formatFeishuRunStatus(runs: RunSummary[]): string {
  if (runs.length === 0) {
    return "暂无运行历史。";
  }
  return runs
    .slice(0, 6)
    .map((run) => `${run.skillName}: ${feishuStatusLabel(run.status)} · ${formatFeishuTime(new Date(run.startedAt))}`)
    .join("\n");
}

function asksForRunDiagnostics(content: string): boolean {
  return /(?:失败|报错|错误|原因|日志|为什么|具体|排查|诊断|fail|error|log)/i.test(content);
}

function formatFeishuRunDiagnostics(runs: RunSummary[]): string {
  const candidates = runs
    .filter((run) => run.status === "failed" || run.diagnostic || /(?:error|failed|失败|报错|异常)/i.test(run.lastMessage ?? ""))
    .slice(0, 5);
  if (candidates.length === 0) {
    const latest = runs[0];
    return latest
      ? `最近没有明确失败的任务。\n\n最近任务：${latest.skillName}\n状态：${feishuStatusLabel(latest.status)}\n时间：${formatFeishuTime(new Date(latest.startedAt))}`
      : "暂无运行历史，暂时没有可分析的失败原因。";
  }

  return candidates
    .map((run, index) =>
      [
        `${index + 1}. ${run.skillName}`,
        `状态：${feishuStatusLabel(run.status)}`,
        `时间：${formatFeishuTime(new Date(run.startedAt))}`,
        `运行 ID：${run.runId.slice(0, 8)}`,
        run.diagnostic ? `诊断：${run.diagnostic}` : "",
        run.lastMessage ? `日志摘要：${truncateForLog(stripInlineMarkdown(run.lastMessage), 900)}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

function extractJsonObject(value: string): Record<string, unknown> | null {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? value.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) {
    return null;
  }
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeFeishuIntent(value: Record<string, unknown> | null): FeishuIntent | null {
  if (!value) {
    return null;
  }
  const rawAction = typeof value.action === "string" ? value.action : "";
  const actions: FeishuIntent["action"][] = ["run_skill", "list_skills", "status", "help", "chat", "reply_waiting", "clarify_waiting"];
  if (!actions.includes(rawAction as FeishuIntent["action"])) {
    return null;
  }
  return {
    action: rawAction as FeishuIntent["action"],
    skillId: typeof value.skillId === "string" ? value.skillId : undefined,
    input: typeof value.input === "string" ? value.input : undefined,
    reply: typeof value.reply === "string" ? value.reply : undefined,
    runId: typeof value.runId === "string" ? value.runId : undefined,
    runIndex: typeof value.runIndex === "number" ? value.runIndex : undefined,
    waitingReply: typeof value.waitingReply === "string" ? value.waitingReply : undefined,
    confidence: typeof value.confidence === "number" ? value.confidence : undefined
  };
}

function fallbackFeishuIntent(content: string, skills: SkillSummary[]): FeishuIntent {
  if (/帮助|help|怎么用|指令/i.test(content)) {
    return { action: "help", confidence: 0.8 };
  }
  if (/列表|技能|skill list|有哪些/i.test(content) && !findSkillByText(skills, content)) {
    return { action: "list_skills", confidence: 0.75 };
  }
  if (asksForRunDiagnostics(content)) {
    return { action: "status", confidence: 0.76 };
  }
  if (/状态|进度|历史|status|运行/i.test(content) && !findSkillByText(skills, content)) {
    return { action: "status", confidence: 0.7 };
  }
  const skill = findSkillByText(skills, content);
  if (skill) {
    return { action: "run_skill", skillId: skill.id, input: content, confidence: 0.68 };
  }
  return {
    action: "chat",
    reply: "我已收到。你可以告诉我想运行哪个技能和目标，也可以发送 /skill list 查看技能列表。",
    confidence: 0.5
  };
}

function fallbackFeishuChatReply(content: string, waitingRun?: RunSummary | null): string {
  if (/几点|现在时间|现在几点|time/i.test(content)) {
    return `现在是 ${formatFeishuTime(new Date())}。`;
  }
  if (/^(你好|您好|hi|hello|hey)/i.test(content.trim())) {
    return waitingRun
      ? `你好，我是 Skill-Space 管家。当前有一个任务在等待确认，但我没有把这句话当作任务回复。\n\n${summarizeWaitingRun(waitingRun)}`
      : "你好，我是 Skill-Space 管家。你可以直接告诉我想运行哪个技能，或问我当前任务状态。";
  }
  return waitingRun
    ? `我收到你的消息了。当前还有任务等待确认；如果要继续任务，请回复明确选项，例如 1、A、用方案B、确认发布。\n\n${summarizeWaitingRun(waitingRun)}`
    : "我收到你的消息了。你可以告诉我想执行的任务，也可以发送 /skill list 查看技能列表。";
}

async function answerFeishuChat(
  config: SkillSpaceConfig,
  content: string,
  skills: SkillSummary[],
  runs: RunSummary[],
  conversation: LlmConversationMessage[],
  waitingRuns: RunSummary[] = []
): Promise<string> {
  const llmConfig = (await readLlmConfig(config)) ?? defaultLlmConfig();
  const waitingRun = waitingRuns[0] ?? null;
  if (!llmConfig.enabled) {
    return fallbackFeishuChatReply(content, waitingRun);
  }

  try {
    return await callConfiguredLlm(
      config,
      [
        skillSpaceStewardIdentity(),
        "",
        "你正在飞书里直接和用户对话。请自由、自然地回答用户，不要只返回固定模板。",
        "如果用户是在闲聊、问时间、问你是谁、问应用状态，请直接回答。",
        "只有当用户明确要求运行某个技能时，才建议使用 /skill run 或让应用调度技能。",
        "如果存在等待确认的任务，但用户消息不像明确选择或确认，不要把它当作任务回复；可以提醒用户当前等待事项。",
        "如果有多个等待确认任务，提醒用户使用“任务1：...”这样的格式指定目标，不要替用户猜。",
        "",
        `当前时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
        "",
        "等待确认任务：",
        summarizeWaitingRuns(waitingRuns),
        "",
        "最近运行：",
        JSON.stringify(
          runs.slice(0, 6).map((run) => ({
            skillName: run.skillName,
            status: run.status,
            startedAt: run.startedAt,
            lastMessage: run.lastMessage ? truncateForLog(run.lastMessage, 300) : undefined
          })),
          null,
          2
        ),
        "",
        "可用技能摘要：",
        JSON.stringify(
          skills.slice(0, 12).map((skill) => ({
            id: skill.id,
            name: skill.name,
            description: skill.description
          })),
          null,
          2
        ),
        "",
        "最近飞书对话：",
        formatConversationHistory(conversation),
        "",
        `用户消息：${content}`
      ].join("\n")
    );
  } catch (error) {
    feishuLastError = error instanceof Error ? error.message : String(error);
    return fallbackFeishuChatReply(content, waitingRun);
  }
}

async function readFeishuConversation(config: SkillSpaceConfig): Promise<LlmConversationMessage[]> {
  const messages = await readJsonFile<LlmConversationMessage[]>(feishuConversationPath(config));
  return (messages ?? [])
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-20)
    .map((item) => ({
      ...item,
      content: compactFeishuConversationContent(item.role, item.content)
    }));
}

async function appendFeishuConversation(config: SkillSpaceConfig, role: LlmConversationMessage["role"], content: string): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) {
    return;
  }
  const messages = await readFeishuConversation(config);
  messages.push({ role, content: compactFeishuConversationContent(role, trimmed), at: new Date().toISOString() });
  await writeJsonFile(feishuConversationPath(config), messages.slice(-20));
}

function compactFeishuConversationContent(role: LlmConversationMessage["role"], content: string): string {
  const limit = role === "assistant" ? 900 : 1_200;
  const lines = stripInlineMarkdown(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const compacted = lines.slice(0, role === "assistant" ? 18 : 24).join("\n");
  return truncateForLog(compacted || content, limit);
}

async function listFeishuDecisionLogs(config: SkillSpaceConfig): Promise<FeishuDecisionLogEntry[]> {
  const logs = await readJsonFile<FeishuDecisionLogEntry[]>(feishuDecisionLogPath(config));
  return (logs ?? []).slice(0, 80);
}

async function appendFeishuDecisionLog(
  config: SkillSpaceConfig,
  entry: Omit<FeishuDecisionLogEntry, "id" | "at">
): Promise<void> {
  const logs = await listFeishuDecisionLogs(config);
  const next: FeishuDecisionLogEntry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    ...entry,
    message: truncateForLog(entry.message, 500),
    replyPreview: entry.replyPreview ? truncateForLog(entry.replyPreview, 500) : undefined
  };
  await writeJsonFile(feishuDecisionLogPath(config), [next, ...logs].slice(0, 200));
}

function formatFeishuDecisionLogs(logs: FeishuDecisionLogEntry[]): string {
  if (logs.length === 0) {
    return "暂无飞书调度决策日志。";
  }
  return logs
    .slice(0, 8)
    .map((entry, index) => {
      const detail = [
        `${index + 1}. ${entry.action} · ${formatFeishuTime(new Date(entry.at))}`,
        `原因：${entry.reason}`,
        entry.skillId ? `技能：${entry.skillId}` : "",
        entry.runId ? `运行 ID：${entry.runId}` : "",
        typeof entry.confidence === "number" ? `置信度：${Math.round(entry.confidence * 100)}%` : "",
        `消息：${entry.message}`
      ].filter(Boolean);
      return detail.join("\n");
    })
    .join("\n\n");
}

function formatConversationHistory(messages: LlmConversationMessage[]): string {
  if (messages.length === 0) {
    return "none";
  }
  return messages
    .slice(-10)
    .map((message) => `${message.role === "user" ? "user" : "assistant"}: ${message.content}`)
    .join("\n");
}

async function classifyFeishuIntent(
  config: SkillSpaceConfig,
  content: string,
  skills: SkillSummary[],
  runs: RunSummary[],
  conversation: LlmConversationMessage[],
  waitingRuns: RunSummary[] = []
): Promise<FeishuIntent> {
  const fallback = fallbackFeishuIntent(content, skills);
  const llmConfig = (await readLlmConfig(config)) ?? defaultLlmConfig();
  if (!llmConfig.enabled) {
    return fallback;
  }

  try {
    const result = await callConfiguredLlm(
      config,
      [
        "你是 Skill-Space 的飞书入口调度器。请理解用户从手机飞书发来的自然语言，决定应该查看技能、查看状态、启动技能，还是普通回复。",
        "你也是等待任务回复调度器：如果用户是在回复某个等待确认任务，请输出 reply_waiting，并给出 runIndex 或 runId，以及真正要发给任务的 waitingReply。",
        "如果用户说“执行第6个技能”“运行某个技能”“启动工作流”，这是 run_skill，不是等待任务回复，即使里面有数字也不要输出 reply_waiting。",
        "安全规则：当有多个等待任务，而用户只说“可以、确认、继续、好、OK”这类泛化确认时，不要猜目标，请输出 clarify_waiting。",
        "安全规则：只有用户明确给出任务编号、运行 ID、选题编号，或上下文能唯一对应一个等待任务时，才输出 reply_waiting。",
        "只输出 JSON，不要输出 Markdown 或解释。",
        'JSON schema: {"action":"run_skill|list_skills|status|help|chat|reply_waiting|clarify_waiting","skillId":"可选，必须来自 skills.id","input":"传给技能的用户原始目标或参数","reply":"普通回复内容","runIndex":1,"runId":"可选","waitingReply":"要发送给等待任务的短回复，例如 4、确认、方案B","confidence":0.0}',
        "",
        "等待确认任务（编号从 1 开始，用户可能说“任务2选4”“第二个用4”“刚才那个确认”）：",
        summarizeWaitingRuns(waitingRuns),
        "",
        "可用技能：",
        JSON.stringify(
          skills.slice(0, 80).map((skill) => ({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            tags: skill.tags
          })),
          null,
          2
        ),
        "",
        "最近运行：",
        JSON.stringify(
          runs.slice(0, 8).map((run) => ({
            id: run.runId,
            skillName: run.skillName,
            status: run.status
          })),
          null,
          2
        ),
        "",
        "最近飞书对话：",
        formatConversationHistory(conversation),
        "",
        `用户消息：${content}`
      ].join("\n")
    );
    return normalizeFeishuIntent(extractJsonObject(result)) ?? fallback;
  } catch (error) {
    feishuLastError = error instanceof Error ? error.message : String(error);
    return fallback;
  }
}

async function dispatchFeishuIntent(
  config: SkillSpaceConfig,
  content: string,
  intent: FeishuIntent,
  sendReply: (text: string, kind?: FeishuReplyKind, title?: string) => Promise<void>,
  conversation: LlmConversationMessage[] = [],
  waitingRuns: RunSummary[] = []
): Promise<void> {
  const skills = await scanSkills(config);
  const runs = await listRuns(config);

  if (intent.action === "help") {
    await sendReply("可直接发送自然语言任务，例如：用公众号技能写一篇今日 AI 热点文章。也可使用 /skill list、/skill status、/skill decisions、/skill run <技能ID> <输入>。任务等待确认时，直接回复 1、确认或补充内容即可。", "steward", "使用帮助");
    return;
  }

  if (intent.action === "list_skills") {
    await sendReply(formatFeishuSkillList(skills), "steward", "技能列表");
    return;
  }

  if (intent.action === "status") {
    await sendReply(asksForRunDiagnostics(content) ? formatFeishuRunDiagnostics(runs) : formatFeishuRunStatus(runs), "steward", "运行状态");
    return;
  }

  if (intent.action === "run_skill") {
    const skill = findSkillByText(skills, content, intent.skillId);
    if (!skill) {
      await sendReply("我理解你想启动技能，但没有匹配到具体技能。请发送 /skill list 查看可用技能，或直接说出技能名称。", "steward", "未匹配技能");
      return;
    }
    const response = await runSkill(config, {
      skillId: skill.id,
      runtime: skill.defaultRuntime,
      input: intent.input?.trim() || content
    });
    await sendReply(`已启动：${skill.name}\n运行 ID：${response.runId}`, "system", "已启动任务");
    return;
  }

  await sendReply(await answerFeishuChat(config, content, skills, runs, conversation, waitingRuns), "steward");
}

async function handleFeishuMessage(config: SkillSpaceConfig, rawMessage: unknown): Promise<void> {
  const content = extractFeishuMessageText(rawMessage);
  const sender = extractFeishuSenderName(rawMessage);
  const stored = await readFeishuConfig(config);
  const target = extractFeishuMessageTarget(rawMessage, stored);
  const inboundMessageId = extractFeishuMessageId(rawMessage);
  if (!target) {
    return;
  }
  if (shouldIgnoreFeishuMessage(rawMessage, content, inboundMessageId)) {
    return;
  }

  const sendProcessingReceipt = async (): Promise<void> => {
    feishuLastReplyPreview = "已收到，处理中";
    feishuProcessing = true;
    try {
      const marked = inboundMessageId ? await addFeishuProcessingReaction(inboundMessageId) : false;
      feishuDeliveryStatus = "received";
      feishuDeliveryDetail = marked ? "已在原消息上标记收到，正在处理。" : "已收到飞书消息，正在处理。";
    } catch (error) {
      feishuLastError = error instanceof Error ? error.message : String(error);
      feishuDeliveryStatus = "failed";
      feishuDeliveryDetail = feishuLastError;
    }
  };

  const sendReply = async (text: string, kind: FeishuReplyKind = "steward", title?: string): Promise<void> => {
    const outbound = wrapFeishuReply(text, kind, title);
    const plainTitle = feishuReplyPlainTitle(kind, title);
    if (feishuChannel?.send) {
      feishuDeliveryStatus = "sending";
      feishuDeliveryDetail = "正在发送飞书回复。";
      try {
        await sendFeishuPostReplyChunks(target, inboundMessageId, plainTitle, outbound);
        feishuLastOutboundAt = new Date().toISOString();
        feishuDeliveryStatus = "sent";
        feishuDeliveryDetail = "飞书回复已发送。";
        feishuLastReplyPreview = truncateForLog(text, 500);
        feishuLastReplyAt = feishuLastOutboundAt;
        feishuProcessing = false;
        await appendFeishuConversation(config, "assistant", text);
        return;
      } catch (error) {
        feishuLastError = error instanceof Error ? error.message : String(error);
        feishuDeliveryStatus = "failed";
        feishuDeliveryDetail = feishuLastError;
        feishuProcessing = false;
        if (error instanceof FeishuPartialSendError && error.sentChunks > 0) {
          feishuDeliveryDetail = `飞书回复已发送 ${error.sentChunks} 段，后续内容发送失败：${feishuLastError}`;
          feishuLastReplyPreview = truncateForLog(text, 500);
          feishuLastReplyAt = new Date().toISOString();
          await appendFeishuConversation(config, "assistant", text);
          return;
        }
        if (inboundMessageId) {
          for (const chunk of splitFeishuText(formatFeishuOutboundMarkdown(outbound), feishuMessageChunkLimit)) {
            await feishuChannel.send(target, { markdown: chunk }, { replyTo: inboundMessageId, replyInThread: false });
          }
          feishuLastOutboundAt = new Date().toISOString();
          feishuDeliveryStatus = "sent";
          feishuDeliveryDetail = "飞书回复已发送。";
          feishuLastReplyPreview = truncateForLog(text, 500);
          feishuLastReplyAt = feishuLastOutboundAt;
          feishuProcessing = false;
          await appendFeishuConversation(config, "assistant", text);
          return;
        }
        throw error;
      }
    }
    await sendFeishuMarkdown(config, outbound);
    feishuLastReplyPreview = truncateForLog(text, 500);
    feishuLastReplyAt = new Date().toISOString();
    feishuProcessing = false;
    await appendFeishuConversation(config, "assistant", text);
  };

  if (!content) {
    return;
  }
  feishuLastInboundAt = new Date().toISOString();
  feishuLastInboundText = truncateForLog(content, 500);
  feishuLastInboundSender = sender;
  feishuLastReplyPreview = undefined;
  feishuLastReplyAt = undefined;
  feishuProcessing = true;
  feishuDeliveryStatus = "received";
  feishuDeliveryDetail = "已收到飞书消息，正在处理。";
  await sendProcessingReceipt();
  await appendFeishuConversation(config, "user", content);

  if (!content.startsWith("/skill")) {
    const waitingRuns = await listWaitingRuns(config);
    const pickedWaitingReply = pickResolvedWaitingRunReply(content, waitingRuns);
    if (pickedWaitingReply && isLikelyWaitingRunReply(pickedWaitingReply.reply)) {
      try {
        await continueRun(config, {
          runId: pickedWaitingReply.run.runId,
          input: pickedWaitingReply.reply
        });
        await appendFeishuDecisionLog(config, {
          action: "waiting_reply",
          reason: pickedWaitingReply.reason,
          message: content,
          runId: pickedWaitingReply.run.runId,
          replyPreview: pickedWaitingReply.reply
        });
        await sendReply(`已把「${pickedWaitingReply.reply}」发送到任务：${pickedWaitingReply.run.skillName}`, "task", "已转发确认");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        feishuLastError = message;
        await sendReply(`收到「${pickedWaitingReply.reply}」，但转发到任务失败：${message}`, "task", "转发失败");
      }
      return;
    }
    if (waitingRuns.length === 1 && isLikelyWaitingRunReply(content)) {
      const [waitingRun] = waitingRuns;
      try {
        await continueRun(config, {
          runId: waitingRun.runId,
          input: content
        });
        await appendFeishuDecisionLog(config, {
          action: "waiting_reply",
          reason: "只有一个等待任务，且用户消息像明确确认或选项。",
          message: content,
          runId: waitingRun.runId
        });
        await sendReply(`已把「${content}」发送到任务：${waitingRun.skillName}`, "task", "已转发确认");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        feishuLastError = message;
        await sendReply(`收到「${content}」，但转发到任务失败：${message}`, "task", "转发失败");
      }
      return;
    }

    const skills = await scanSkills(config);
    const runs = await listRuns(config);
    const conversation = await readFeishuConversation(config);
    const intent = await classifyFeishuIntent(config, content, skills, runs, conversation, waitingRuns);
    await appendFeishuDecisionLog(config, {
      action: intent.action,
      reason: intent.confidence ? "LLM 或本地规则完成意图分类。" : "使用本地默认分类。",
      message: content,
      skillId: intent.skillId,
      confidence: intent.confidence,
      runId: intent.runId,
      replyPreview: intent.waitingReply ?? intent.reply
    });

    if (intent.action === "clarify_waiting") {
      await sendReply(formatWaitingRunChoices(waitingRuns), "system", "请选择任务");
      return;
    }

    const intentWaitingReply = resolveIntentWaitingRun(intent, waitingRuns);
    if (intentWaitingReply) {
      if (
        waitingRuns.length > 1 &&
        isGenericWaitingConfirmation(content) &&
        !/任务|task|run|第|选题|选项|方案|选择|采用|用|按|刚才|上一个|最近/i.test(content)
      ) {
        await appendFeishuDecisionLog(config, {
          action: "waiting_ambiguous",
          reason: "LLM 给出了等待任务目标，但用户是泛化确认；为避免误操作要求用户明确指定任务。",
          message: content
        });
        await sendReply(formatWaitingRunChoices(waitingRuns), "system", "请选择任务");
        return;
      }

      try {
        await continueRun(config, {
          runId: intentWaitingReply.run.runId,
          input: intentWaitingReply.reply
        });
        await appendFeishuDecisionLog(config, {
          action: "waiting_reply",
          reason: intentWaitingReply.reason,
          message: content,
          runId: intentWaitingReply.run.runId,
          confidence: intent.confidence,
          replyPreview: intentWaitingReply.reply
        });
        await sendReply(`已把「${intentWaitingReply.reply}」发送到任务：${intentWaitingReply.run.skillName}`, "task", "已转发确认");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        feishuLastError = message;
        await sendReply(`收到「${intentWaitingReply.reply}」，但转发到任务失败：${message}`, "task", "转发失败");
      }
      return;
    }

    if (waitingRuns.length > 1 && isLikelyWaitingRunReply(content)) {
      await appendFeishuDecisionLog(config, {
        action: "waiting_ambiguous",
        reason: "管家没有可靠锁定目标，且用户消息像确认选项；要求用户明确指定任务。",
        message: content,
        confidence: intent.confidence
      });
      await sendReply(formatWaitingRunChoices(waitingRuns), "system", "请选择任务");
      return;
    }

    await dispatchFeishuIntent(config, content, intent, sendReply, conversation, waitingRuns);
    return;
  }

  const [, command = "help", ...rest] = content.split(/\s+/);
  if (command === "help") {
    await sendReply("可用指令：/skill list、/skill run <技能ID或名称> <输入>、/skill status、/skill decisions。任务等待确认时，直接回复 1、2、3 等即可；多个等待任务时请回复“任务1：确认内容”。", "steward", "使用帮助");
    return;
  }

  if (command === "list") {
    const skills = await scanSkills(config);
    await sendReply(formatFeishuSkillList(skills), "steward", "技能列表");
    return;
  }

  if (command === "status") {
    const runs = await listRuns(config);
    await sendReply(formatFeishuRunStatus(runs), "steward", "运行状态");
    return;
  }

  if (command === "decisions" || command === "decision-log") {
    await sendReply(formatFeishuDecisionLogs(await listFeishuDecisionLogs(config)), "steward", "决策日志");
    return;
  }

  if (command === "run") {
    const [skillToken, ...inputParts] = rest;
    if (!skillToken) {
      await sendReply("请使用：/skill run <技能ID或名称> <输入>", "steward", "缺少技能");
      return;
    }
    const skills = await scanSkills(config);
    const skill = findSkillByText(skills, skillToken, skillToken);
    if (!skill) {
      await sendReply(`没有找到技能：${skillToken}`, "steward", "未匹配技能");
      return;
    }
    const response = await runSkill(config, {
      skillId: skill.id,
      runtime: skill.defaultRuntime,
      input: inputParts.join(" ") || "来自飞书的远程执行请求。"
    });
    await appendFeishuDecisionLog(config, {
      action: "command_run",
      reason: "用户使用 /skill run 命令启动技能。",
      message: content,
      skillId: skill.id,
      runId: response.runId
    });
    await sendReply(`已启动：${skill.name}\n运行 ID：${response.runId}`, "system", "已启动任务");
  }
}

function registryIndexPath(config: SkillSpaceConfig): string {
  return join(dirname(config.registry.path), "skills.index.json");
}

async function listSkillChanges(config: SkillSpaceConfig): Promise<SkillChange[]> {
  const changes = await readJsonFile<SkillChange[]>(skillChangesPath(config));
  return (changes ?? []).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

function describeSkillChange(previous: SkillSummary, skill: SkillSummary): { summary: string; changedFields: string[] } {
  const changedFields: string[] = [];
  const parts: string[] = [];

  if (previous.version !== skill.version) {
    changedFields.push("version");
    parts.push(`版本 ${previous.version} -> ${skill.version}`);
  }
  if (previous.description !== skill.description) {
    changedFields.push("description");
    parts.push(`说明更新：${skill.description || "暂无说明"}`);
  }
  if (previous.updatedAt !== skill.updatedAt) {
    changedFields.push("content");
    if (previous.description === skill.description && previous.version === skill.version) {
      parts.push("文件内容已更新，但版本和说明未变化。");
    }
  }

  return {
    summary: parts.join("；") || "内容更新",
    changedFields
  };
}

async function recordSkillChanges(config: SkillSpaceConfig, skills: SkillSummary[]): Promise<void> {
  const previousIndex = await readJsonFile<{ skills?: SkillSummary[] }>(registryIndexPath(config));
  const previousSkills = new Map((previousIndex?.skills ?? []).map((skill) => [skill.id, skill]));
  const detectedAt = new Date().toISOString();
  const changes = skills
    .map((skill): SkillChange | null => {
      const previous = previousSkills.get(skill.id);
      if (!previous) {
        return null;
      }

      if (
        previous.version === skill.version &&
        previous.updatedAt === skill.updatedAt &&
        previous.description === skill.description
      ) {
        return null;
      }

      const { summary, changedFields } = describeSkillChange(previous, skill);
      return {
        id: `${skill.id}-${detectedAt}`,
        skillId: skill.id,
        skillName: skill.name,
        detectedAt,
        summary,
        changedFields,
        before: {
          version: previous.version,
          updatedAt: previous.updatedAt,
          description: previous.description
        },
        after: {
          version: skill.version,
          updatedAt: skill.updatedAt,
          description: skill.description
        }
      };
    })
    .filter((change): change is SkillChange => Boolean(change));

  if (changes.length === 0) {
    return;
  }

  const existing = await listSkillChanges(config);
  await writeJsonFile(skillChangesPath(config), [...changes, ...existing].slice(0, 100));
}

async function listSkillFiles(root: string, current = root, entries: SkillFileEntry[] = []): Promise<SkillFileEntry[]> {
  const children = await readdir(current, { withFileTypes: true });

  for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entries.length >= 160 || child.name === ".git" || child.name === "node_modules") {
      continue;
    }

    const absolutePath = join(current, child.name);
    const itemStat = await stat(absolutePath);
    const itemPath = relative(root, absolutePath).replace(/\\/g, "/");
    entries.push({
      path: itemPath,
      kind: child.isDirectory() ? "directory" : "file",
      size: child.isDirectory() ? undefined : itemStat.size,
      updatedAt: itemStat.mtime.toISOString()
    });

    if (child.isDirectory()) {
      await listSkillFiles(root, absolutePath, entries);
    }
  }

  return entries;
}

function isPublishTextFile(path: string, size?: number): boolean {
  if ((size ?? 0) > 2_000_000) {
    return false;
  }
  return /\.(md|txt|json|ya?ml|toml|js|ts|tsx|jsx|py|ps1|sh|bat|cmd|env|ini|xml|html|css)$/i.test(path);
}

function nextTemplateVariable(
  variables: Map<string, PublishTemplateVariable>,
  kind: PublishTemplateVariable["kind"],
  example: string
): PublishTemplateVariable {
  const existing = [...variables.values()].find((item) => item.kind === kind && item.example === example);
  if (existing) {
    return existing;
  }
  const key = `${kind}_${[...variables.values()].filter((item) => item.kind === kind).length + 1}`;
  const variable: PublishTemplateVariable = {
    key,
    label: kind === "path" ? "本地路径" : kind === "secret" ? "密钥或令牌" : "文本配置",
    kind,
    placeholder: `{{${kind}.${key}}}`,
    example
  };
  variable.label = kind === "path" ? "本地路径" : kind === "secret" ? "密钥或令牌" : "文本配置";
  variables.set(variable.placeholder, variable);
  return variable;
}

function sanitizePublishText(
  text: string,
  config: SkillSpaceConfig,
  variables: Map<string, PublishTemplateVariable>,
  warnings: string[]
): string {
  let nextText = text;
  const home = process.env.USERPROFILE ?? process.env.HOME;
  const knownPaths = [home, config.dataRoot, ...config.skillRoots].filter((item): item is string => Boolean(item));
  for (const knownPath of knownPaths.sort((a, b) => b.length - a.length)) {
    const normalized = knownPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const variable = nextTemplateVariable(variables, "path", knownPath);
    nextText = nextText.replace(new RegExp(normalized, "gi"), variable.placeholder);
  }

  nextText = nextText.replace(/[A-Za-z]:\\[^\s`"'<>|]+/g, (match) => {
    const variable = nextTemplateVariable(variables, "path", match);
    return variable.placeholder;
  });
  nextText = nextText.replace(/\/(?:Users|home)\/[^\s`"'<>|]+/g, (match) => {
    const variable = nextTemplateVariable(variables, "path", match);
    return variable.placeholder;
  });
  nextText = nextText.replace(/\b(?:sk-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g, (match) => {
    const variable = nextTemplateVariable(variables, "secret", `${match.slice(0, 6)}...`);
    warnings.push(`已替换疑似密钥：${variable.placeholder}`);
    return variable.placeholder;
  });
  nextText = nextText.replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{12,})["']?/gi, (match) => {
    const variable = nextTemplateVariable(variables, "secret", "configured-secret");
    warnings.push(`已替换疑似敏感配置：${variable.placeholder}`);
    return match.replace(/[:=]\s*["']?.*$/s, `= ${variable.placeholder}`);
  });

  nextText = nextText.replace(
    /^(\s*(?:公众号名称|公众号|账号|账户|App\s*ID|App\s*Secret|API\s*Key|Token|Secret|Password|密钥|令牌)\s*[:：=]\s*)(.+)$/gim,
    (match, prefix: string, value: string) => {
      const kind: PublishTemplateVariable["kind"] = /secret|password|token|key|密钥|令牌/i.test(prefix) ? "secret" : "text";
      const variable = nextTemplateVariable(variables, kind, value.trim().slice(0, 60));
      warnings.push(`已模板化敏感配置：${variable.placeholder}`);
      return `${prefix}${variable.placeholder}`;
    }
  );

  return nextText;
}

function publishInputsSchema(variables: PublishTemplateVariable[]): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Skill 模板配置",
    type: "object",
    required: variables.map((item) => item.key),
    properties: Object.fromEntries(
      variables.map((item) => [
        item.key,
        {
          type: "string",
          title: item.label,
          description: `用于替换 ${item.placeholder}`,
          default: "",
          examples: item.example ? [item.example] : undefined
        }
      ])
    )
  };
}

function inputSchemaVariables(schema: unknown): PublishTemplateVariable[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }
  const schemaObject = schema as Record<string, unknown>;
  const properties = schemaObject.properties;
  if (!properties || typeof properties !== "object") {
    return [];
  }
  const required = new Set(Array.isArray(schemaObject.required) ? schemaObject.required.map(String) : []);
  return Object.entries(properties as Record<string, unknown>)
    .filter(([key]) => required.has(key))
    .map(([key, value]) => {
      const field = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      return {
        key,
        label: String(field.title ?? field.label ?? key),
        kind: "text",
        placeholder: `{{text.${key}}}`,
        example: Array.isArray(field.examples) ? String(field.examples[0] ?? "") : String(field.default ?? "")
      } satisfies PublishTemplateVariable;
    });
}

function mergeTemplateVariables(variables: PublishTemplateVariable[]): PublishTemplateVariable[] {
  const seen = new Set<string>();
  return variables.filter((variable) => {
    if (seen.has(variable.key)) {
      return false;
    }
    seen.add(variable.key);
    return true;
  });
}

async function copyPublishTemplateFiles(
  sourceRoot: string,
  targetRoot: string,
  config: SkillSpaceConfig,
  variables: Map<string, PublishTemplateVariable>,
  warnings: string[]
): Promise<{ filesProcessed: number; filesCopied: number }> {
  const files = await listSkillFiles(sourceRoot);
  let filesProcessed = 0;
  let filesCopied = 0;

  for (const file of files) {
    if (file.kind !== "file") {
      continue;
    }
    if (file.path.startsWith(".git/") || file.path.includes("/node_modules/")) {
      continue;
    }
    const sourcePath = join(sourceRoot, file.path);
    const targetPath = join(targetRoot, file.path);
    if (!isPathInside(sourceRoot, sourcePath, true) || !isPathInside(targetRoot, targetPath, true)) {
      warnings.push(`已跳过不安全路径：${file.path}`);
      continue;
    }
    await mkdir(dirname(targetPath), { recursive: true });
    if (isPublishTextFile(file.path, file.size)) {
      const text = await readFile(sourcePath, "utf8");
      await writeFile(targetPath, sanitizePublishText(text, config, variables, warnings), "utf8");
      filesProcessed += 1;
    } else {
      await cp(sourcePath, targetPath, { force: true });
    }
    filesCopied += 1;
  }

  return { filesProcessed, filesCopied };
}

async function readPublishTextCorpus(root: string): Promise<string> {
  const files = await listSkillFiles(root);
  const chunks: string[] = [];
  for (const file of files) {
    if (file.kind !== "file" || !isPublishTextFile(file.path, file.size)) {
      continue;
    }
    if (file.path.startsWith(".git/") || file.path.includes("/node_modules/")) {
      continue;
    }
    const sourcePath = join(root, file.path);
    if (isPathInside(root, sourcePath, true)) {
      chunks.push(await readFile(sourcePath, "utf8"));
    }
  }
  return chunks.join("\n\n");
}

function hasSkillReference(corpus: string, skill: SkillSummary): boolean {
  const haystack = corpus.toLowerCase();
  const needles = [skill.id, skill.name, ...skill.tags].map((item) => item.toLowerCase()).filter((item) => item.length > 2);
  return needles.some((needle) => new RegExp(`(^|[^a-z0-9_-])${escapeRegex(needle)}([^a-z0-9_-]|$)`, "i").test(haystack));
}

async function collectSkillDependencies(
  config: SkillSpaceConfig,
  sourceSkill: SkillSummary,
  targetRoot: string,
  variables: Map<string, PublishTemplateVariable>,
  warnings: string[]
): Promise<{ dependencies: SkillTemplateDependency[]; filesProcessed: number; filesCopied: number }> {
  const allSkills = await scanSkills(config);
  const byId = new Map(allSkills.map((skill) => [skill.id, skill]));
  const queue: Array<{ skill: SkillSummary; depth: number; reason: string }> = [];
  const declared = await readOptionalJson<{ dependencies?: Array<{ id?: string; reason?: string }> }>(
    join(sourceSkill.root, ".skillspace", "dependencies.json")
  );
  for (const dependency of declared?.dependencies ?? []) {
    if (!dependency.id || dependency.id === sourceSkill.id) {
      continue;
    }
    const skill = byId.get(dependency.id);
    if (skill) {
      queue.push({ skill, depth: 1, reason: dependency.reason || `Declared dependency: ${dependency.id}` });
    } else {
      warnings.push(`Declared dependency was not found locally and cannot be bundled: ${dependency.id}.`);
    }
  }

  const corpus = await readPublishTextCorpus(sourceSkill.root);
  for (const candidate of allSkills) {
    if (candidate.id !== sourceSkill.id && resolve(candidate.root) !== resolve(sourceSkill.root) && hasSkillReference(corpus, candidate)) {
      queue.push({ skill: candidate, depth: 1, reason: `Referenced by ${sourceSkill.id}` });
    }
  }

  const dependencies: SkillTemplateDependency[] = [];
  const visited = new Set<string>();
  let filesProcessed = 0;
  let filesCopied = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.skill.id) || current.skill.id === sourceSkill.id) {
      continue;
    }
    visited.add(current.skill.id);
    const bundledPath = `references/bundled-skills/${current.skill.id}`;
    const bundledRoot = join(targetRoot, bundledPath);
    await rm(bundledRoot, { recursive: true, force: true });
    const copied = await copyPublishTemplateFiles(current.skill.root, bundledRoot, config, variables, warnings);
    await ensureSkillSpaceManifest(bundledRoot);
    filesProcessed += copied.filesProcessed;
    filesCopied += copied.filesCopied;
    dependencies.push({
      id: current.skill.id,
      name: current.skill.name,
      version: current.skill.version,
      reason: current.reason,
      bundledPath
    });
  }
  return { dependencies, filesProcessed, filesCopied };
}

async function detectTemplateRequirements(
  packageRoot: string,
  variables: PublishTemplateVariable[],
  dependencies: SkillTemplateDependency[]
): Promise<Record<string, unknown>> {
  const corpus = (await readPublishTextCorpus(packageRoot)).toLowerCase();
  const cliCandidates = ["node", "npm", "pnpm", "python", "uv", "git", "md2wechat", "wsl", "docker", "ffmpeg", "claude", "codex", "openclaw"];
  const cliTools = cliCandidates.filter((tool) => new RegExp(`(^|[^a-z0-9_-])${escapeRegex(tool)}([^a-z0-9_-]|$)`, "i").test(corpus));
  const serviceCandidates = [
    { id: "feishu", keywords: ["飞书", "lark", "feishu"] },
    { id: "wechat", keywords: ["微信公众号", "微信", "wechat", "md2wechat"] },
    { id: "openai", keywords: ["openai", "gpt", "api_key", "api key"] },
    { id: "aliyun", keywords: ["阿里云", "aliyun", "oss"] },
    { id: "github", keywords: ["github", "git"] }
  ];
  const externalServices = serviceCandidates
    .filter((service) => service.keywords.some((keyword) => corpus.includes(keyword.toLowerCase())))
    .map((service) => service.id);
  return {
    schemaVersion: "skillspace.requirements.v1",
    generatedAt: new Date().toISOString(),
    bundledDependencies: dependencies.map((dependency) => ({
      id: dependency.id,
      version: dependency.version,
      path: dependency.bundledPath,
      reason: dependency.reason
    })),
    requiredConfiguration: variables.map((variable) => ({
      key: variable.key,
      label: variable.label,
      kind: variable.kind,
      placeholder: variable.placeholder,
      example: variable.example ?? ""
    })),
    externalServices: Array.from(new Set(externalServices)),
    cliTools: Array.from(new Set(cliTools))
  };
}

async function auditPreparedTemplatePackage(packageRoot: string, warnings: string[]): Promise<void> {
  const corpus = await readPublishTextCorpus(packageRoot);
  const checks: Array<{ pattern: RegExp; message: string }> = [
    { pattern: /[A-Za-z]:\\Users\\|C:\\Users\\/i, message: "发布包仍包含 Windows 用户路径，请检查模板化是否完整。" },
    { pattern: /\/(?:Users|home)\/[A-Za-z0-9_.-]+\//i, message: "发布包仍包含 Unix/macOS 用户路径，请检查模板化是否完整。" },
    { pattern: /\b(?:sk-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,})\b/, message: "发布包仍包含疑似密钥或令牌。" },
    { pattern: /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?(?!\{\{secret\.)[A-Za-z0-9_./+=-]{12,}/i, message: "发布包仍包含疑似明文敏感配置。" },
    { pattern: /(?:公众号名称|公众号|账号|账户)\s*[:：=]\s*(?!\{\{text\.)[^\n{}]{2,80}/i, message: "发布包可能仍包含具体账号或公众号信息。" }
  ];
  for (const check of checks) {
    if (check.pattern.test(corpus) && !warnings.includes(check.message)) {
      warnings.push(check.message);
    }
  }
}

function runSummaryPath(config: SkillSpaceConfig, runId: string): string {
  return join(config.runsRoot, runId, "run.json");
}

async function writeRunSummary(summary: RunSummary): Promise<void> {
  await writeFile(join(summary.runRoot, "run.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

async function normalizeRunSummaryFromLog(run: RunSummary): Promise<RunSummary> {
  if (shouldTreatRunAsCompleted(run)) {
    return { ...run, status: "completed" };
  }
  if (!["waiting_input", "failed"].includes(run.status) || !run.endedAt || run.exitCode !== 0 || !existsSync(run.logPath)) {
    return run;
  }

  try {
    if (!isPathInside(run.runRoot, run.logPath)) {
      return run;
    }
    const lines = (await readFile(run.logPath, "utf8")).split(/\r?\n/).filter(Boolean);
    const assistantMessages: string[] = [];
    for (const line of lines) {
      const event = JSON.parse(line) as RunEvent;
      if (event.type === "assistant" && event.message) {
        assistantMessages.push(event.message);
      }
    }
    const finalAssistantMessage = assistantMessages.at(-1);
    if (
      finalAssistantMessage &&
      (isCompletionReportMessage(finalAssistantMessage) || !isActionableUserDecisionRequest(finalAssistantMessage))
    ) {
      return { ...run, status: "completed", lastMessage: finalAssistantMessage };
    }
  } catch {
    return run;
  }

  return run;
}

async function listRuns(config: SkillSpaceConfig): Promise<RunSummary[]> {
  await mkdir(config.runsRoot, { recursive: true });
  const entries = await readdir(config.runsRoot, { withFileTypes: true });
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readJsonFile<RunSummary>(runSummaryPath(config, entry.name)))
  );

  const normalizedRuns = await Promise.all(
    runs
      .filter((run): run is RunSummary => Boolean(run))
      .map((run) =>
        shouldTreatRunAsCompleted(run)
          ? { ...run, status: "completed" as const }
          : normalizeRunSummaryFromLog(run)
      )
  );

  return normalizedRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

async function deleteRun(config: SkillSpaceConfig, runId: string): Promise<{ deleted: boolean }> {
  const runSummary = await readJsonFile<RunSummary>(runSummaryPath(config, runId));
  const targetRoot = runSummary?.runRoot ?? join(config.runsRoot, runId);
  if (!isPathInside(config.runsRoot, targetRoot)) {
    throw new Error("Refusing to delete a path outside the runs directory.");
  }

  await rm(targetRoot, { recursive: true, force: true });
  return { deleted: true };
}

async function listSchedules(config: SkillSpaceConfig): Promise<ScheduledTask[]> {
  await mkdir(scheduleRoot(config), { recursive: true });
  const schedules = await readJsonFile<ScheduledTask[]>(schedulesPath(config));
  return (schedules ?? [])
    .map((task) => ({
      ...task,
      cadence: (task.cadence as string) === "hourly" ? "interval" : task.cadence
    }) as ScheduledTask)
    .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
}

async function writeSchedules(config: SkillSpaceConfig, schedules: ScheduledTask[]): Promise<void> {
  await writeJsonFile(schedulesPath(config), schedules);
}

function nextScheduleDate(
  task: Pick<ScheduledTask, "cadence" | "timeOfDay" | "intervalMinutes" | "dayOfWeek" | "dayOfMonth">,
  from = new Date()
): Date {
  if (task.cadence === "interval" || (task.cadence as string) === "hourly") {
    const minutes = Math.max(1, task.intervalMinutes ?? 60);
    return new Date(from.getTime() + minutes * 60_000);
  }

  const [hours, minutes] = (task.timeOfDay ?? "09:00").split(":").map(Number);
  const withTime = (date: Date): Date => {
    const next = new Date(date);
    next.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    return next;
  };

  if (task.cadence === "daily") {
    const next = withTime(from);
    if (next <= from) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  if (task.cadence === "weekly") {
    const targetDay = Math.min(6, Math.max(0, task.dayOfWeek ?? 1));
    const next = new Date(from);
    const offset = (targetDay - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + offset);
    const timed = withTime(next);
    if (timed <= from) {
      timed.setDate(timed.getDate() + 7);
    }
    return timed;
  }

  if (task.cadence === "monthly") {
    const day = Math.min(31, Math.max(1, task.dayOfMonth ?? 1));
    const makeMonthlyDate = (year: number, month: number): Date => {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return withTime(new Date(year, month, Math.min(day, daysInMonth)));
    };
    let next = makeMonthlyDate(from.getFullYear(), from.getMonth());
    if (next <= from) {
      next = makeMonthlyDate(from.getFullYear(), from.getMonth() + 1);
    }
    return next;
  }

  if (task.timeOfDay) {
    const [hours, minutes] = task.timeOfDay.split(":").map(Number);
    const next = new Date(from);
    next.setHours(Number.isFinite(hours) ? hours : from.getHours(), Number.isFinite(minutes) ? minutes : from.getMinutes(), 0, 0);
    return next > from ? next : new Date(from.getTime() + 60_000);
  }

  return new Date(from.getTime() + 60_000);
}

async function createSchedule(config: SkillSpaceConfig, request: CreateScheduleRequest): Promise<ScheduledTask> {
  const skill = await findSkill(config, request.skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${request.skillId}`);
  }

  const now = new Date();
  const task: ScheduledTask = {
    id: randomUUID(),
    name: request.name.trim() || `${skill.name} automation`,
    skillId: skill.id,
    skillName: skill.name,
    runtime: request.runtime,
    input: request.input,
    cadence: request.cadence,
    timeOfDay: request.timeOfDay,
    intervalMinutes: request.intervalMinutes,
    dayOfWeek: request.dayOfWeek,
    dayOfMonth: request.dayOfMonth,
    enabled: true,
    createdAt: now.toISOString(),
    nextRunAt: nextScheduleDate(request, now).toISOString()
  };
  const schedules = await listSchedules(config);
  await writeSchedules(config, [...schedules, task]);
  return task;
}

async function deleteSchedule(config: SkillSpaceConfig, scheduleId: string): Promise<{ deleted: boolean }> {
  const schedules = await listSchedules(config);
  await writeSchedules(
    config,
    schedules.filter((task) => task.id !== scheduleId)
  );
  return { deleted: true };
}

async function toggleSchedule(config: SkillSpaceConfig, scheduleId: string, enabled: boolean): Promise<ScheduledTask> {
  const schedules = await listSchedules(config);
  const index = schedules.findIndex((task) => task.id === scheduleId);
  if (index < 0) {
    throw new Error(`Schedule not found: ${scheduleId}`);
  }

  const task = {
    ...schedules[index],
    enabled,
    nextRunAt: enabled ? nextScheduleDate(schedules[index]).toISOString() : schedules[index].nextRunAt
  };
  schedules[index] = task;
  await writeSchedules(config, schedules);
  return task;
}

async function getRunEvents(config: SkillSpaceConfig, runId: string): Promise<RunEvent[]> {
  const runSummary = await readJsonFile<RunSummary>(runSummaryPath(config, runId));
  if (!runSummary || !existsSync(runSummary.logPath)) {
    return [];
  }
  if (!isPathInside(config.runsRoot, runSummary.runRoot) || !isPathInside(runSummary.runRoot, runSummary.logPath)) {
    return [];
  }

  const lines = (await readFile(runSummary.logPath, "utf8")).split(/\r?\n/).filter(Boolean);
  const events = lines
    .map((line) => {
      try {
        return JSON.parse(line) as RunEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is RunEvent => Boolean(event));

  if (runSummary.runtime !== "claude") {
    return events;
  }

  return events.flatMap((event) => {
    if (event.type !== "stdout") {
      return [event];
    }

    const parsed = event.message
      .split(/\r?\n/)
      .map((line) => normalizeClaudeEvent(line).event)
      .filter((item): item is Omit<RunEvent, "runId" | "timestamp"> => Boolean(item))
      .map((item) => ({
        runId: event.runId,
        ...item,
        timestamp: event.timestamp
      }));

    return parsed.length > 0 ? parsed : [event];
  });
}

async function listRunArtifacts(config: SkillSpaceConfig, runId: string): Promise<RunArtifact[]> {
  const runSummary = await readJsonFile<RunSummary>(runSummaryPath(config, runId));
  if (!runSummary) {
    return [];
  }

  if (!isPathInside(config.runsRoot, runSummary.runRoot)) {
    return [];
  }

  const entries = await readdir(runSummary.runRoot, { withFileTypes: true });
  const artifacts = await Promise.all(
    entries
      .filter((entry) => !["run.json", "events.jsonl"].includes(entry.name))
      .map(async (entry): Promise<RunArtifact> => {
        const absolutePath = join(runSummary.runRoot, entry.name);
        const itemStat = await stat(absolutePath);
        return {
          path: absolutePath,
          name: entry.name,
          kind: entry.isDirectory() ? "directory" : "file",
          size: entry.isDirectory() ? undefined : itemStat.size,
          updatedAt: itemStat.mtime.toISOString()
        };
      })
  );

  return artifacts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function openRunFolder(config: SkillSpaceConfig, runId: string): Promise<{ opened: boolean; message: string }> {
  const runSummary = await readJsonFile<RunSummary>(runSummaryPath(config, runId));
  if (!runSummary) {
    return { opened: false, message: "Run not found." };
  }
  if (!isPathInside(config.runsRoot, runSummary.runRoot)) {
    return { opened: false, message: "Refusing to open a path outside the runs directory." };
  }

  const result = await shell.openPath(runSummary.runRoot);
  return { opened: !result, message: result || runSummary.runRoot };
}

async function getSkillDetail(config: SkillSpaceConfig, skillId: string): Promise<SkillDetail> {
  const skill = await findSkill(config, skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  const manifest =
    (await readJsonFile<Record<string, unknown>>(join(skill.root, ".skillspace", "manifest.json"))) ?? {};
  const metadataPath = (key: string, fallback: string): string =>
    join(skill.root, String(manifest[key] ?? fallback));

  return {
    ...skill,
    skillMarkdown: (await readTextFile(join(skill.root, "SKILL.md"))) ?? "",
    workflowText: await readTextFile(metadataPath("workflow", ".skillspace/workflow.yaml")),
    inputSchema: await readOptionalJson(metadataPath("inputSchema", ".skillspace/inputs.schema.json")),
    outputSchema: await readOptionalJson(metadataPath("outputSchema", ".skillspace/outputs.schema.json")),
    installConfig: await readOptionalJson(join(skill.root, ".skillspace", "install-config.json")),
    permissions: await readOptionalJson(metadataPath("permissions", ".skillspace/permissions.json")),
    adapters: await readOptionalJson(metadataPath("adapters", ".skillspace/adapters.json")),
    files: await listSkillFiles(skill.root)
  };
}

async function prepareSkillPackage(config: SkillSpaceConfig, skillId: string): Promise<PrepareSkillPackageResponse> {
  const skill = await findSkill(config, skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`);
  }
  if (!isPathInside(config.skillRoots[0], skill.root) && !config.skillRoots.some((root) => isPathInside(root, skill.root, true))) {
    throw new Error("Refusing to publish a skill outside configured skill roots.");
  }

  const packageId = `${slugifySkillName(skill.name || skill.id)}-${skill.version.replace(/[^A-Za-z0-9_.-]/g, "_")}-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}`;
  const targetRoot = join(publishRoot(config), packageId);
  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });

  const variables = new Map<string, PublishTemplateVariable>();
  const warnings: string[] = [];
  const copied = await copyPublishTemplateFiles(skill.root, targetRoot, config, variables, warnings);
  const dependencyBundle = await collectSkillDependencies(config, skill, targetRoot, variables, warnings);
  const existingInputSchema = await readOptionalJson(join(targetRoot, ".skillspace", "inputs.schema.json"));
  const variableList = mergeTemplateVariables([...variables.values(), ...inputSchemaVariables(existingInputSchema)]);
  const requirements = await detectTemplateRequirements(targetRoot, variableList, dependencyBundle.dependencies);
  await auditPreparedTemplatePackage(targetRoot, warnings);
  const metadataRoot = join(targetRoot, ".skillspace");
  await mkdir(metadataRoot, { recursive: true });
  await writeJsonFile(join(metadataRoot, "dependencies.json"), {
    schemaVersion: "skillspace.dependencies.v1",
    generatedAt: new Date().toISOString(),
    dependencies: dependencyBundle.dependencies
  });
  await writeJsonFile(join(metadataRoot, "requirements.json"), requirements);

  const manifestPath = join(metadataRoot, "publish.json");
  await writeJsonFile(manifestPath, {
    schemaVersion: "skillspace.publish.v1",
    packageId,
    sourceSkillId: skill.id,
    sourceSkillName: skill.name,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    preparedAt: new Date().toISOString(),
    template: {
      variables: variableList,
      inputSchema: ".skillspace/inputs.schema.json",
      dependencies: ".skillspace/dependencies.json",
      requirements: ".skillspace/requirements.json"
    },
    safety: {
      status: warnings.length > 0 ? "review_required" : "ready",
      warnings
    },
    install: {
      entry: "SKILL.md",
      requiresConfiguration: variableList.length > 0
    }
  });

  const generatedInputSchema = publishInputsSchema(variableList);
  const existingSchemaObject =
    typeof existingInputSchema === "object" && existingInputSchema ? (existingInputSchema as Record<string, unknown>) : {};
  await writeJsonFile(join(metadataRoot, "inputs.schema.json"), {
    ...existingSchemaObject,
    title: existingSchemaObject.title ?? generatedInputSchema.title,
    type: "object",
    required: Array.from(
      new Set([
        ...((Array.isArray(existingSchemaObject.required) ? existingSchemaObject.required : []) as string[]),
        ...((generatedInputSchema.required as string[]) ?? [])
      ])
    ),
    properties: {
      ...((typeof existingSchemaObject.properties === "object" && existingSchemaObject.properties
        ? existingSchemaObject.properties
        : {}) as Record<string, unknown>),
      ...((generatedInputSchema.properties as Record<string, unknown>) ?? {})
    }
  });
  await writeJsonFile(join(metadataRoot, "README.publish.json"), {
    note: "This package was prepared by Skill-Space as a reusable template. Review publish.json before uploading.",
    packageRoot: targetRoot
  });

  return {
    prepared: true,
    skill: (await scanSkillFolder(skill.root)) ?? skill,
    packageRoot: targetRoot,
    manifestPath,
    variables: variableList,
    dependencies: dependencyBundle.dependencies,
    requirements,
    warnings,
    filesProcessed: copied.filesProcessed + dependencyBundle.filesProcessed,
    filesCopied: copied.filesCopied + dependencyBundle.filesCopied
  };
}

function runtimeList(value: unknown, fallback: AgentId[]): AgentId[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const allowed: AgentId[] = ["claude", "codex", "openclaw", "hermes"];
  const normalized = value.filter((item): item is AgentId => typeof item === "string" && (allowed.includes(item) || /^[a-z0-9][a-z0-9_-]{1,47}$/i.test(item)));
  return normalized.length > 0 ? normalized : fallback;
}

async function ensureSkillSpaceManifest(skillRoot: string): Promise<void> {
  const skillPath = join(skillRoot, "SKILL.md");
  const metadataRoot = join(skillRoot, ".skillspace");
  const manifestPath = join(metadataRoot, "manifest.json");

  if (existsSync(manifestPath) || !existsSync(skillPath)) {
    return;
  }

  const markdown = await readFile(skillPath, "utf8");
  const frontmatter = parseFrontmatter(markdown);
  const id = slugifySkillName(frontmatter.name ?? basename(skillRoot));
  await mkdir(metadataRoot, { recursive: true });
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: "skillspace.skill.v1",
        id,
        name: frontmatter.name ?? id,
        version: "0.1.0",
        description: frontmatter.description ?? "Imported portable SKILL.md skill.",
        entry: "SKILL.md",
        workflow: ".skillspace/workflow.yaml",
        inputSchema: ".skillspace/inputs.schema.json",
        outputSchema: ".skillspace/outputs.schema.json",
        permissions: ".skillspace/permissions.json",
        adapters: ".skillspace/adapters.json",
        runtimes: ["claude", "hermes", "openclaw", "codex"],
        defaultRuntime: "claude",
        tags: ["imported"]
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(
    join(metadataRoot, "permissions.json"),
    `${JSON.stringify(
      {
        mode: "full",
        filesystem: { read: ["*"], write: ["*"] },
        commands: { allow: ["*"], approvalRequired: [] },
        network: { enabled: true, domains: ["*"] },
        secrets: { allowReferences: true, storePlaintext: false }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function bumpPatchVersion(value: unknown): string {
  const parts = String(value ?? "0.1.0")
    .split(".")
    .map((part) => Number.parseInt(part.replace(/\D+/g, ""), 10));
  const major = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 1;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
  return `${major}.${minor}.${patch + 1}`;
}

async function bumpSkillManifestVersion(skillRoot: string, reason: string): Promise<string> {
  const manifestPath = join(skillRoot, ".skillspace", "manifest.json");
  const manifest = (await readJsonFile<Record<string, unknown>>(manifestPath)) ?? {};
  const nextVersion = bumpPatchVersion(manifest.version);
  await writeJsonFile(manifestPath, {
    ...manifest,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    versionBump: {
      reason,
      bumpedAt: new Date().toISOString()
    }
  });
  return nextVersion;
}

function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function findPortableSkillRoot(root: string, depth = 0): Promise<string | null> {
  if (existsSync(join(root, "SKILL.md")) || existsSync(join(root, ".skillspace", "manifest.json"))) {
    return root;
  }

  if (depth >= 4) {
    return null;
  }

  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const found = await findPortableSkillRoot(join(root, entry.name), depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

async function latestSkillMtime(root: string, depth = 0): Promise<Date> {
  let latest = (await stat(root)).mtime;
  if (depth >= 4) {
    return latest;
  }

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return latest;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    const absolutePath = join(root, entry.name);
    const itemStat = await stat(absolutePath);
    if (itemStat.mtime > latest) {
      latest = itemStat.mtime;
    }

    if (entry.isDirectory()) {
      const childLatest = await latestSkillMtime(absolutePath, depth + 1);
      if (childLatest > latest) {
        latest = childLatest;
      }
    }
  }

  return latest;
}

async function scanSkillFolder(root: string): Promise<SkillSummary | null> {
  const skillMdPath = join(root, "SKILL.md");
  const manifestPath = join(root, ".skillspace", "manifest.json");
  const legacyManifestPath = join(root, "skill.json");

  if (!existsSync(skillMdPath) && !existsSync(manifestPath) && !existsSync(legacyManifestPath)) {
    return null;
  }

  const skillMd = existsSync(skillMdPath) ? await readFile(skillMdPath, "utf8") : "";
  const frontmatter = parseFrontmatter(skillMd);
  const manifest =
    (await readJsonFile<Record<string, unknown>>(manifestPath)) ??
    (await readJsonFile<Record<string, unknown>>(legacyManifestPath)) ??
    {};
  const updatedAt = await latestSkillMtime(root);

  const id =
    String(manifest.id ?? frontmatter.name ?? basename(root))
      .trim()
      .toLowerCase() || basename(root).toLowerCase();
  const runtimes = runtimeList(manifest.runtimes, ["claude", "hermes", "openclaw"]);
  const defaultRuntime = runtimes.includes(manifest.defaultRuntime as AgentId)
    ? (manifest.defaultRuntime as AgentId)
    : runtimes[0];

  return {
    id,
    name: String(manifest.name ?? frontmatter.name ?? basename(root)),
    description: String(manifest.description ?? frontmatter.description ?? "No description yet."),
    version: String(manifest.version ?? "0.1.0"),
    defaultRuntime,
    runtimes,
    root,
    tags: Array.isArray(manifest.tags) ? manifest.tags.map(String).slice(0, 1) : [],
    hasSkillSpaceMetadata: existsSync(manifestPath),
    updatedAt: updatedAt.toISOString()
  };
}

async function importSkill(config: SkillSpaceConfig): Promise<ImportSkillResponse> {
  const dialogOptions: OpenDialogOptions = {
    title: "导入 Skill",
    properties: ["openFile", "openDirectory"],
    filters: [
      { name: "Skill files", extensions: ["md", "zip", "json"] },
      { name: "All files", extensions: ["*"] }
    ]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return { imported: false, message: "Import cancelled." };
  }

  const source = result.filePaths[0];
  const sourceStat = await stat(source);
  let destination: string;
  let portableRoot: string | null = null;

  if (sourceStat.isDirectory()) {
    portableRoot = (await findPortableSkillRoot(source)) ?? source;
    const sourceName = basename(portableRoot);
    destination = await uniqueSkillRoot(config, sourceName);
    await cp(portableRoot, destination, {
      recursive: true,
      force: false,
      errorOnExist: true
    });
  } else {
    const extension = extname(source).toLowerCase();
    if (extension === ".zip") {
      const importRoot = join(config.importRoot, randomUUID());
      await mkdir(importRoot, { recursive: true });
      const expanded = await runProcess(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `Expand-Archive -LiteralPath ${psSingleQuote(source)} -DestinationPath ${psSingleQuote(importRoot)} -Force`
        ],
        { timeoutMs: 60_000 }
      );

      if (expanded.code !== 0) {
        return {
          imported: false,
          message: `Zip import failed: ${expanded.output || "Expand-Archive returned an error."}`
        };
      }

      portableRoot = await findPortableSkillRoot(importRoot);
      if (!portableRoot) {
        return {
          imported: false,
          message: "Zip imported, but no SKILL.md package was found inside."
        };
      }

      destination = await uniqueSkillRoot(config, basename(portableRoot));
      await cp(portableRoot, destination, {
        recursive: true,
        force: false,
        errorOnExist: true
      });
    } else if (extension === ".md") {
      const markdown = await readFile(source, "utf8");
      const frontmatter = parseFrontmatter(markdown);
      destination = await uniqueSkillRoot(config, frontmatter.name ?? basename(source, extension));
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, "SKILL.md"), markdown, "utf8");
    } else {
      return {
        imported: false,
        message: "Import supports folders, .zip packages, and standalone SKILL.md files."
      };
    }
  }

  await ensureSkillSpaceManifest(destination);
  let skill = await scanSkillFolder(destination);
  if (skill && shouldSummarizeDescription(skill.description)) {
    try {
      await summarizeSkill(config, skill.id);
      skill = await scanSkillFolder(destination);
    } catch {
      // Keep import non-blocking if Claude is unavailable.
    }
  }

  return {
    imported: Boolean(skill),
    skill: skill ?? undefined,
    message: skill ? `Imported ${skill.name}.` : "Import completed, but no valid SKILL.md was found."
  };
}

async function readLocalMarketplaceTemplates(config: SkillSpaceConfig): Promise<SkillTemplateListing[]> {
  const parsed = await readOptionalJson(marketplaceCatalogPath(config));
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((item): item is SkillTemplateListing => Boolean(item && typeof item === "object" && "id" in item))
    .map((item) => ({
      ...item,
      source: item.source ?? "local"
    }));
}

async function writeLocalMarketplaceTemplates(config: SkillSpaceConfig, templates: SkillTemplateListing[]): Promise<void> {
  await mkdir(marketplaceRoot(config), { recursive: true });
  await writeJsonFile(marketplaceCatalogPath(config), templates);
}

async function readUploadedTemplateState(config: SkillSpaceConfig): Promise<UploadedTemplateState> {
  const parsed = await readOptionalJson(marketplaceUploadedPath(config));
  if (Array.isArray(parsed)) {
    return {
      ids: new Set(parsed.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))),
      tokens: new Map()
    };
  }
  if (parsed && typeof parsed === "object") {
    const record = parsed as { ids?: unknown; tokens?: unknown };
    const ids = Array.isArray(record.ids)
      ? record.ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : [];
    const tokens = record.tokens && typeof record.tokens === "object" && !Array.isArray(record.tokens)
      ? Object.entries(record.tokens as Record<string, unknown>)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim()))
      : [];
    return {
      ids: new Set([...ids, ...tokens.map(([id]) => id)]),
      tokens: new Map(tokens)
    };
  }
  return { ids: new Set(), tokens: new Map() };
}

async function writeUploadedTemplateState(config: SkillSpaceConfig, state: UploadedTemplateState): Promise<void> {
  await writeJsonFile(marketplaceUploadedPath(config), {
    schemaVersion: "skillspace.marketplace.uploaded.v2",
    ids: Array.from(state.ids).sort(),
    tokens: Object.fromEntries(Array.from(state.tokens.entries()).sort(([left], [right]) => left.localeCompare(right)))
  });
}

async function rememberUploadedTemplate(config: SkillSpaceConfig, templateId: string, deleteToken?: string): Promise<void> {
  const state = await readUploadedTemplateState(config);
  state.ids.add(templateId);
  if (deleteToken?.trim()) {
    state.tokens.set(templateId, deleteToken.trim());
  }
  await writeUploadedTemplateState(config, state);
}

async function uploadedTemplateDeleteToken(config: SkillSpaceConfig, templateId: string): Promise<string | undefined> {
  return (await readUploadedTemplateState(config)).tokens.get(templateId);
}

async function forgetUploadedTemplate(config: SkillSpaceConfig, templateId: string): Promise<void> {
  const state = await readUploadedTemplateState(config);
  state.ids.delete(templateId);
  state.tokens.delete(templateId);
  await writeUploadedTemplateState(config, state);
}

async function migrateLocalMarketplaceTemplates(config: SkillSpaceConfig): Promise<SkillTemplateListing[]> {
  const templates = await readLocalMarketplaceTemplates(config);
  let changed = false;
  const migrated: SkillTemplateListing[] = [];

  for (const template of templates) {
    if (
      template.source === "local" &&
      template.packageRoot &&
      isPathInside(publishRoot(config), template.packageRoot, true) &&
      existsSync(template.packageRoot)
    ) {
      const nextPackageRoot = join(marketplaceRoot(config), "packages", basename(template.packageRoot));
      if (!existsSync(nextPackageRoot)) {
        await mkdir(dirname(nextPackageRoot), { recursive: true });
        await cp(template.packageRoot, nextPackageRoot, { recursive: true, force: true });
      }
      migrated.push({ ...template, packageRoot: nextPackageRoot });
      changed = true;
    } else {
      migrated.push(template);
    }
  }

  if (changed) {
    await writeLocalMarketplaceTemplates(config, migrated);
  }
  return migrated;
}

async function fetchRemoteMarketplaceTemplates(): Promise<SkillTemplateListing[]> {
  try {
    const response = await fetch(`${marketplaceCatalogUrl}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      return [];
    }
    const parsed = await response.json();
    const templates: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).templates)
        ? ((parsed as Record<string, unknown>).templates as unknown[])
        : [];
    return templates
      .filter((item: unknown): item is SkillTemplateListing => Boolean(item && typeof item === "object" && "id" in item))
      .map((item) => {
        const record = repairMojibakeDeep(item) as SkillTemplateListing & { metricsVerified?: boolean };
        return {
          ...record,
          downloads: record.metricsVerified ? Number(record.downloads || 0) : 0,
          rating: record.metricsVerified ? Number(record.rating || 0) : 0,
          source: "remote" as const
        };
      });
  } catch {
    return [];
  }
}

function countCjk(value: string): number {
  return value.match(/[\p{Script=Han}]/gu)?.length ?? 0;
}

function repairMojibakeText(value: string): string {
  if (!/[ÃÂâãåæçèéï]/.test(value)) {
    return value;
  }
  const repaired = Buffer.from(value, "latin1").toString("utf8");
  if (countCjk(repaired) > countCjk(value) + 1 || /(?:ã|ï¼|â)/.test(value)) {
    return repaired;
  }
  return value;
}

function repairMojibakeDeep(value: unknown): unknown {
  if (typeof value === "string") {
    return repairMojibakeText(value);
  }
  if (Array.isArray(value)) {
    return value.map(repairMojibakeDeep);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairMojibakeDeep(item)]));
  }
  return value;
}

async function installedTemplateIds(config: SkillSpaceConfig): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const skill of await scanSkills(config)) {
    ids.add(skill.id);
    const manifest = await readOptionalJson(join(skill.root, ".skillspace", "manifest.json"));
    if (manifest && typeof manifest === "object") {
      const marketplace = (manifest as Record<string, unknown>).marketplace;
      if (marketplace && typeof marketplace === "object" && "templateId" in marketplace) {
        ids.add(String((marketplace as Record<string, unknown>).templateId));
      }
    }
  }
  return ids;
}

const supportSkillIds = new Set(["skill-space", "skill-space-capture", "skill-space-smoke-test", "system-context"]);

function skillToInstalledTemplate(skill: SkillSummary): SkillTemplateListing {
  return {
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
    safetyStatus: skill.hasSkillSpaceMetadata ? "ready" : "review_required",
    updatedAt: skill.updatedAt,
    source: "local",
    packageRoot: skill.root,
    installed: true
  };
}

async function listMarketplaceTemplates(config: SkillSpaceConfig, includeRemote = true): Promise<SkillTemplateListing[]> {
  const localTemplates = await migrateLocalMarketplaceTemplates(config);
  const remoteTemplates = includeRemote ? await fetchRemoteMarketplaceTemplates() : [];
  const installedSkills = (await scanSkills(config)).filter((skill) => !supportSkillIds.has(skill.id));
  const installedIds = await installedTemplateIds(config);
  const installedSkillTemplates = installedSkills.map(skillToInstalledTemplate);
  const uploadedState = await readUploadedTemplateState(config);
  const localById = new Map(localTemplates.map((template) => [template.id, template]));
  const remoteIds = new Set(remoteTemplates.map((template) => template.id));
  const seen = new Set<string>();
  const builtInTemplates = process.env.SKILL_SPACE_SHOW_BUILTIN_TEMPLATES === "1" ? marketplaceTemplates : [];
  return [
    ...remoteTemplates,
    ...localTemplates,
    ...installedSkillTemplates,
    ...builtInTemplates
  ]
    .filter((template) => {
      const key = `${template.source ?? "unknown"}:${template.id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((template) => ({
      ...template,
      packageRoot: template.packageRoot ?? localById.get(template.id)?.packageRoot,
      installed: installedIds.has(template.id),
      uploaded: uploadedState.ids.has(template.id) || Boolean(template.uploaded) || (template.source === "local" && remoteIds.has(template.id)),
      deleteTokenStored: uploadedState.tokens.has(template.id)
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function publishSkillTemplate(config: SkillSpaceConfig, skillId: string): Promise<PublishTemplateResponse> {
  const prepared = await prepareSkillPackage(config, skillId);
  const packageRoot = join(marketplaceRoot(config), "packages", basename(prepared.packageRoot));
  await rm(packageRoot, { recursive: true, force: true });
  await mkdir(dirname(packageRoot), { recursive: true });
  await cp(prepared.packageRoot, packageRoot, { recursive: true, force: true });
  const safeName = sanitizeTemplateListingText(prepared.skill.name, prepared.skill.tags[0]);
  const safeDescription = sanitizeTemplateListingText(prepared.skill.description, prepared.skill.tags[0]);
  const template: SkillTemplateListing = {
    id: prepared.skill.id,
    name: safeName,
    description: safeDescription,
    version: prepared.skill.version,
    author: "Local",
    category: prepared.skill.tags[0] ?? "SkillOps",
    downloads: 0,
    rating: 0,
    runtimes: prepared.skill.runtimes,
    requiredVariables: prepared.variables,
    dependencies: prepared.dependencies,
    requirements: prepared.requirements,
    safetyStatus: prepared.warnings.length > 0 ? "review_required" : "ready",
    updatedAt: new Date().toISOString(),
    source: "local",
    packageRoot
  };
  const localTemplates = await readLocalMarketplaceTemplates(config);
  await writeLocalMarketplaceTemplates(config, [
    template,
    ...localTemplates.filter((item) => item.id !== template.id)
  ]);

  return {
    published: true,
    template,
    packageRoot,
    warnings: prepared.warnings,
    message: `已加入本地工作流库：${template.name}`
  };
}

function sanitizeTemplateListingText(value: string, tag?: string): string {
  const cleaned = value
    .replace(/[A-Za-z]:\\[^\s`"'<>|]+/g, "{{path.local}}")
    .replace(/\/(?:Users|home)\/[^\s`"'<>|]+/g, "{{path.local}}")
    .replace(/[\p{Script=Han}A-Za-z0-9_-]{2,24}(?=公众号)/gu, "")
    .replace(/[\p{Script=Han}A-Za-z0-9_-]{2,24}(?=(?:账号|账户))/gu, "")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|sk-proj-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{12,})\b/g, "{{secret.token}}")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length >= 4) {
    return cleaned.slice(0, 180);
  }
  if (tag) {
    return `${tag}工作流模板`;
  }
  return "通用工作流模板";
}

async function deleteMarketplaceTemplate(config: SkillSpaceConfig, templateId: string): Promise<DeleteTemplateResponse> {
  const localTemplates = await readLocalMarketplaceTemplates(config);
  const template = localTemplates.find((item) => item.id === templateId);
  if (!template) {
    return { deleted: false, message: "这个模板不在本地工作流库中，在线或官方模板不能从本机删除。" };
  }

  if (template.packageRoot) {
    const packageRoot = resolve(template.packageRoot);
    if (isPathInside(marketplaceRoot(config), packageRoot, true) || isPathInside(publishRoot(config), packageRoot, true)) {
      await rm(packageRoot, { recursive: true, force: true });
    }
  }

  await writeLocalMarketplaceTemplates(
    config,
    localTemplates.filter((item) => item.id !== templateId)
  );
  return { deleted: true, message: `已从本地工作流库删除：${template.name}` };
}

function isSafePackageRelativePath(pathValue: string): boolean {
  const normalized = pathValue.replace(/\\/g, "/");
  return Boolean(normalized) && !normalized.startsWith("/") && !normalized.includes("..") && !/^[A-Za-z]:/.test(normalized);
}

async function readTemplatePackageFiles(packageRoot: string): Promise<TemplatePackageFile[]> {
  const files = await listSkillFiles(packageRoot);
  const packageFiles: TemplatePackageFile[] = [];
  let totalBytes = 0;
  for (const file of files) {
    if (file.kind !== "file" || !isSafePackageRelativePath(file.path)) {
      continue;
    }
    if (file.path.startsWith(".git/") || file.path.includes("/node_modules/")) {
      continue;
    }
    const sourcePath = join(packageRoot, file.path);
    if (!isPathInside(packageRoot, sourcePath, true)) {
      continue;
    }
    const encoding: TemplatePackageFile["encoding"] = isPublishTextFile(file.path, file.size) ? "utf8" : "base64";
    const content = encoding === "utf8" ? await readFile(sourcePath, "utf8") : (await readFile(sourcePath)).toString("base64");
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > 6_000_000) {
      throw new Error("Template package is too large for online sharing.");
    }
    packageFiles.push({ path: file.path, content, encoding });
  }
  return packageFiles.slice(0, 320);
}

async function writeTemplatePackageFiles(
  targetRoot: string,
  packageFiles: TemplatePackageFile[],
  variables: Record<string, string>
): Promise<void> {
  for (const file of packageFiles) {
    if (!isSafePackageRelativePath(file.path)) {
      continue;
    }
    const targetPath = join(targetRoot, file.path);
    if (!isPathInside(targetRoot, targetPath, true)) {
      continue;
    }
    await mkdir(dirname(targetPath), { recursive: true });
    if (file.encoding === "base64") {
      await writeFile(targetPath, Buffer.from(file.content, "base64"));
    } else {
      await writeFile(targetPath, applyTemplateVariablesToText(file.content, variables), "utf8");
    }
  }
}

function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function fetchTemplatePackageFiles(template: SkillTemplateListing): Promise<TemplatePackageFile[] | undefined> {
  if (template.packageFiles?.length) {
    return template.packageFiles;
  }
  if (!template.packageUrl) {
    return undefined;
  }
  const response = await fetch(template.packageUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Template package download failed: HTTP ${response.status}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (template.packageSha256 && sha256Buffer(body) !== template.packageSha256) {
    throw new Error("Template package checksum mismatch.");
  }
  const parsed = JSON.parse(body.toString("utf8")) as {
    packageFiles?: TemplatePackageFile[];
    template?: { packageFiles?: TemplatePackageFile[] };
  };
  const packageFiles = parsed.template?.packageFiles ?? parsed.packageFiles;
  if (!Array.isArray(packageFiles) || packageFiles.length === 0) {
    throw new Error("Template package has no installable files.");
  }
  return packageFiles;
}

async function uploadTemplateToRemote(template: SkillTemplateListing): Promise<{ uploaded: boolean; message: string; deleteToken?: string }> {
  const response = await fetch(marketplaceUploadUrl, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ template })
  });
  const parsed = await response.json().catch(() => undefined) as { ok?: boolean; message?: string; deleteToken?: string } | undefined;
  if (!response.ok || !parsed?.ok) {
    return { uploaded: false, message: parsed?.message || `Server rejected upload: HTTP ${response.status}` };
  }
  return {
    uploaded: true,
    message: parsed.message || "Template uploaded to the online workflow library.",
    deleteToken: parsed.deleteToken
  };
}

async function deleteTemplateFromRemote(templateId: string, deleteToken?: string): Promise<{ deleted: boolean; message: string }> {
  const response = await fetch(marketplaceDeleteUrl, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ templateId, deleteToken })
  });
  const parsed = await response.json().catch(() => undefined) as { ok?: boolean; deleted?: boolean; message?: string } | undefined;
  if (!response.ok || !parsed?.ok) {
    return { deleted: false, message: parsed?.message || `Server rejected delete: HTTP ${response.status}` };
  }
  return { deleted: Boolean(parsed.deleted), message: parsed.message || "Online template deleted." };
}

async function deleteUploadedMarketplaceTemplate(config: SkillSpaceConfig, templateId: string): Promise<DeleteTemplateResponse> {
  const deleteToken = await uploadedTemplateDeleteToken(config, templateId);
  if (!deleteToken) {
    return { deleted: false, message: "Cannot delete this online template because this device does not have its delete token." };
  }
  const result = await deleteTemplateFromRemote(templateId, deleteToken);
  if (result.deleted) {
    await forgetUploadedTemplate(config, templateId);
  }
  return result;
}

async function shareMarketplaceTemplate(config: SkillSpaceConfig, templateId: string): Promise<ShareTemplateResponse> {
  const template = (await listMarketplaceTemplates(config, false)).find((item) => item.id === templateId);
  if (!template) {
    return { shared: false, message: "Template not found." };
  }

  const rawPackageRoot = template.packageRoot ? resolve(template.packageRoot) : undefined;
  if (
    template.source === "local" &&
    rawPackageRoot &&
    !isPathInside(marketplaceRoot(config), rawPackageRoot, true) &&
    !isPathInside(publishRoot(config), rawPackageRoot, true)
  ) {
    const published = await publishSkillTemplate(config, template.id);
    if (!published.published || !published.template) {
      return { shared: false, message: published.message };
    }
    return shareMarketplaceTemplate(config, published.template.id);
  }

  const packageId = `${slugifySkillName(template.name || template.id)}-${template.version.replace(/[^A-Za-z0-9_.-]/g, "_")}`;
  const shareRoot = join(marketplaceShareRoot(config), packageId);
  await rm(shareRoot, { recursive: true, force: true });
  await mkdir(shareRoot, { recursive: true });

  const onlineTemplate: SkillTemplateListing = {
    ...template,
    author: template.author || "Skill-Space",
    source: "remote",
    packageRoot: undefined,
    installed: undefined,
    uploaded: undefined,
    requiredVariables: template.requiredVariables.map((variable) => ({ ...variable }))
  };

  if (template.packageRoot) {
    const packageRoot = resolve(template.packageRoot);
    if (!isPathInside(marketplaceRoot(config), packageRoot, true) && !isPathInside(publishRoot(config), packageRoot, true)) {
      throw new Error("Refusing to share a template outside Skill-Space marketplace roots.");
    }
    await cp(packageRoot, join(shareRoot, "package"), { recursive: true, force: true });
    const skillMarkdown = await readTextFile(join(packageRoot, "SKILL.md"));
    if (skillMarkdown) {
      onlineTemplate.templateMarkdown = skillMarkdown;
    }
    onlineTemplate.packageFiles = await readTemplatePackageFiles(packageRoot);
    onlineTemplate.dependencies =
      (await readOptionalJson<{ dependencies?: SkillTemplateDependency[] }>(join(packageRoot, ".skillspace", "dependencies.json")))?.dependencies ??
      template.dependencies;
    onlineTemplate.requirements =
      (await readOptionalJson<Record<string, unknown>>(join(packageRoot, ".skillspace", "requirements.json"))) ??
      template.requirements;
  }

  const catalogPath = join(shareRoot, "catalog.json");
  await writeJsonFile(catalogPath, {
    schemaVersion: "skillspace.marketplace.catalog.v1",
    generatedAt: new Date().toISOString(),
    templates: [onlineTemplate]
  });
  await writeJsonFile(join(shareRoot, "README.upload.json"), {
    purpose: "Upload this folder or merge catalog.json into the online Skill-Space workflow library.",
    catalogUrl: marketplaceCatalogUrl,
    uploadUrl: marketplaceUploadUrl,
    templateId: template.id,
    note: "Runtime configuration fields are kept. Local path variables are hidden by Skill-Space and auto-filled on install."
  });
  const uploadResult = await uploadTemplateToRemote(onlineTemplate).catch((error) => ({
    uploaded: false,
    message: error instanceof Error ? error.message : String(error),
    deleteToken: undefined
  }));
  if (uploadResult.uploaded) {
    await rememberUploadedTemplate(config, template.id, uploadResult.deleteToken);
  }

  return {
    shared: true,
    uploaded: uploadResult.uploaded,
    packageRoot: shareRoot,
    catalogPath,
    deleteTokenSaved: Boolean(uploadResult.deleteToken),
    message: uploadResult.uploaded
      ? `已上传到云端工作流库，并已生成本地发布包：${shareRoot}`
      : `本地发布包已生成，但云端上传失败：${uploadResult.message}。发布包位置：${shareRoot}`
  };
}

async function copyTemplatePackageToSkill(
  sourceRoot: string,
  targetRoot: string,
  variables: Record<string, string>
): Promise<void> {
  const sourceStat = await stat(sourceRoot).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    throw new Error("Invalid template package path.");
  }
  await cp(sourceRoot, targetRoot, { recursive: true, force: true });
  const files = await listSkillFiles(targetRoot);
  const replacements = Object.entries(variables).flatMap(([key, value]) => [
    [`{{path.${key}}}`, value],
    [`{{secret.${key}}}`, value],
    [`{{text.${key}}}`, value],
    [`{{${key}}}`, value]
  ]);

  for (const file of files) {
    if (file.kind !== "file" || !isPublishTextFile(file.path, file.size)) {
      continue;
    }
    const targetPath = join(targetRoot, file.path);
    if (!isPathInside(targetRoot, targetPath, true)) {
      continue;
    }
    let text = await readFile(targetPath, "utf8");
    for (const [placeholder, value] of replacements) {
      text = text.split(placeholder).join(value);
    }
    await writeFile(targetPath, text, "utf8");
  }
}

async function installBundledDependencies(
  config: SkillSpaceConfig,
  installedRoot: string,
  variables: Record<string, string>
): Promise<{ installed: SkillSummary[]; warnings: string[] }> {
  const bundledRoot = join(installedRoot, "references", "bundled-skills");
  const bundledStat = await stat(bundledRoot).catch(() => null);
  if (!bundledStat?.isDirectory()) {
    return { installed: [], warnings: [] };
  }

  const existingSkills = await scanSkills(config);
  const existingById = new Map(existingSkills.map((skill) => [skill.id, skill]));
  const entries = await readdir(bundledRoot, { withFileTypes: true });
  const installed: SkillSummary[] = [];
  const warnings: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const sourceRoot = join(bundledRoot, entry.name);
    const dependency = await scanSkillFolder(sourceRoot);
    if (!dependency) {
      continue;
    }
    const existing = existingById.get(dependency.id);
    if (existing) {
      if (existing.version !== dependency.version) {
        warnings.push(`Bundled dependency ${dependency.name} was not overwritten: installed ${existing.version}, bundled ${dependency.version}.`);
      }
      continue;
    }
    const destination = await uniqueSkillRoot(config, dependency.id);
    await copyTemplatePackageToSkill(sourceRoot, destination, variables);
    await ensureSkillSpaceManifest(destination);
    const installedDependency = await scanSkillFolder(destination);
    if (installedDependency) {
      existingById.set(installedDependency.id, installedDependency);
      installed.push(installedDependency);
    }
  }
  return { installed, warnings };
}

function applyTemplateVariablesToText(text: string, variables: Record<string, string>): string {
  return Object.entries(variables).reduce((current, [key, value]) => {
    return current
      .split(`{{path.${key}}}`).join(value)
      .split(`{{secret.${key}}}`).join(value)
      .split(`{{text.${key}}}`).join(value)
      .split(`{{${key}}}`).join(value);
  }, text);
}

async function writeInstalledTemplateConfig(
  destination: string,
  template: SkillTemplateListing,
  variables: Record<string, string>
): Promise<void> {
  const required = template.requiredVariables.filter((variable) => variable.kind !== "path");
  if (required.length === 0) {
    return;
  }
  await writeJsonFile(join(destination, ".skillspace", "install-config.json"), {
    schemaVersion: "skillspace.install-config.v1",
    templateId: template.id,
    installedAt: new Date().toISOString(),
    configured: required.every((variable) => {
      const value = variables[variable.key]?.trim();
      return Boolean(value && value !== variable.placeholder);
    }),
    requiredVariables: required.map((variable) => ({
      key: variable.key,
      label: variable.label,
      kind: variable.kind,
      placeholder: variable.placeholder
    }))
  });
}

async function installMarketplaceTemplate(config: SkillSpaceConfig, request: InstallTemplateRequest): Promise<InstallTemplateResponse> {
  const template = (await listMarketplaceTemplates(config)).find((item) => item.id === request.templateId);
  if (!template) {
    return { installed: false, message: "Template not found." };
  }

  const destination = await uniqueSkillRoot(config, template.id);
  const metadataRoot = join(destination, ".skillspace");
  await mkdir(metadataRoot, { recursive: true });
  const effectiveVariables = Object.fromEntries(
    template.requiredVariables.map((variable) => [
      variable.key,
      request.variables[variable.key] || (variable.kind === "path" ? destination : variable.placeholder)
    ])
  );

  if (template.packageRoot) {
    const packageRoot = resolve(template.packageRoot);
    if (!isPathInside(publishRoot(config), packageRoot, true) && !isPathInside(marketplaceRoot(config), packageRoot, true)) {
      throw new Error("Refusing to install a template outside Skill-Space publish roots.");
    }
    await copyTemplatePackageToSkill(packageRoot, destination, effectiveVariables);
    await ensureSkillSpaceManifest(destination);
    await writeInstalledTemplateConfig(destination, template, effectiveVariables);
    const dependencyResult = await installBundledDependencies(config, destination, effectiveVariables);
    const skill = await scanSkillFolder(destination);
    const dependencyMessage = [
      dependencyResult.installed.length ? `Bundled dependencies installed: ${dependencyResult.installed.map((item) => item.name).join(", ")}.` : "",
      ...dependencyResult.warnings
    ].filter(Boolean).join(" ");
    return {
      installed: Boolean(skill),
      skill: skill ?? undefined,
      message: skill ? `Installed ${skill.name}.${dependencyMessage ? ` ${dependencyMessage}` : ""}` : "Template installed, but Skill-Space could not read it."
    };
  }

  const packageFiles = await fetchTemplatePackageFiles(template);
  if (packageFiles?.length) {
    await writeTemplatePackageFiles(destination, packageFiles, effectiveVariables);
    await ensureSkillSpaceManifest(destination);
    await writeInstalledTemplateConfig(destination, template, effectiveVariables);
    const dependencyResult = await installBundledDependencies(config, destination, effectiveVariables);
    const skill = await scanSkillFolder(destination);
    const dependencyMessage = [
      dependencyResult.installed.length ? `Bundled dependencies installed: ${dependencyResult.installed.map((item) => item.name).join(", ")}.` : "",
      ...dependencyResult.warnings
    ].filter(Boolean).join(" ");
    return {
      installed: Boolean(skill),
      skill: skill ?? undefined,
      message: skill ? `Installed ${skill.name}.${dependencyMessage ? ` ${dependencyMessage}` : ""}` : "Template installed, but Skill-Space could not read it."
    };
  }

  const variableLines = template.requiredVariables
    .map((variable) => `- ${variable.label}: ${effectiveVariables[variable.key] || variable.placeholder}`)
    .join("\n");
  const fallbackMarkdown = [
    "---",
    `name: ${template.id}`,
    `description: ${template.description}`,
    "---",
    "",
    `# ${template.name}`,
    "",
    template.description,
    "",
    "## 配置",
    "",
    variableLines || "- 无需额外配置",
    "",
    "## 工作流",
    "",
    "1. 读取用户配置和运行输入。",
    "2. 按模板说明执行可复用工作流。",
    "3. 输出结果、运行产物和必要的下一步确认。",
    "",
    "## 来源",
    "",
    `来自 Skill-Space 工作流库模板：${template.id} v${template.version}`,
    ""
  ].join("\n");
  const markdown = applyTemplateVariablesToText(template.templateMarkdown?.trim() || fallbackMarkdown, effectiveVariables);

  await writeFile(join(destination, "SKILL.md"), markdown, "utf8");
  await writeJsonFile(join(metadataRoot, "manifest.json"), {
    schemaVersion: "skillspace.skill.v1",
    id: template.id,
    name: template.name,
    version: template.version,
    description: template.description,
    entry: "SKILL.md",
    inputSchema: ".skillspace/inputs.schema.json",
    permissions: ".skillspace/permissions.json",
    runtimes: template.runtimes,
    defaultRuntime: template.runtimes[0] ?? "claude",
    tags: [template.category],
    marketplace: {
      templateId: template.id,
      installedAt: new Date().toISOString(),
      variables: effectiveVariables
    }
  });
  await writeJsonFile(join(metadataRoot, "inputs.schema.json"), publishInputsSchema(template.requiredVariables));
  await writeJsonFile(join(metadataRoot, "permissions.json"), {
    mode: "full",
    filesystem: { read: ["{{path.*}}"], write: ["{{path.*}}"] },
    commands: { allow: ["*"], approvalRequired: [] },
    network: { enabled: true, domains: ["*"] },
    secrets: { allowReferences: true, storePlaintext: false }
  });
  await writeInstalledTemplateConfig(destination, template, effectiveVariables);

  const skill = await scanSkillFolder(destination);
  return {
    installed: Boolean(skill),
    skill: skill ?? undefined,
    message: skill ? `Installed ${skill.name}.` : "Template installed, but Skill-Space could not read it."
  };
}

async function scanSkills(config: SkillSpaceConfig): Promise<SkillSummary[]> {
  const results: SkillSummary[] = [];

  for (const root of config.skillRoots) {
    await mkdir(root, { recursive: true });
    const entries = await readdir(root, { withFileTypes: true });

    const directSkill = await scanSkillFolder(root);
    if (directSkill) {
      results.push(directSkill);
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skill = await scanSkillFolder(join(root, entry.name));
      if (skill) {
        results.push(skill);
      }
    }
  }

  const sorted = results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  await mkdir(dirname(config.registry.path), { recursive: true });
  await recordSkillChanges(config, sorted);
  await writeFile(
    registryIndexPath(config),
    `${JSON.stringify(
      {
        schemaVersion: "skillspace.registry.index.v1",
        generatedAt: new Date().toISOString(),
        skills: sorted
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return sorted;
}

async function deleteSkill(config: SkillSpaceConfig, skillId: string): Promise<{ deleted: boolean }> {
  const skill = await findSkill(config, skillId);
  if (!skill) {
    return { deleted: false };
  }

  const allowed = config.skillRoots.some((root) => isPathInside(root, skill.root));
  if (!allowed) {
    throw new Error("Refusing to delete a skill outside the Skill-Space skill roots.");
  }

  await rm(skill.root, { recursive: true, force: true });
  return { deleted: true };
}

function knownExternalSkillRoots(config: SkillSpaceConfig): string[] {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? defaultDataRoot();
  return Array.from(
    new Set([
      ...config.skillRoots,
      join(home, ".codex", "skills"),
      join(home, ".agents", "skills"),
      join(home, ".claude", "skills"),
      join(home, ".openclaw", "skills")
    ])
  );
}

async function collectPortableSkillRoots(root: string, depth = 0, results: string[] = []): Promise<string[]> {
  if (!existsSync(root) || depth > 3 || results.length >= 300) {
    return results;
  }

  if (existsSync(join(root, "SKILL.md"))) {
    results.push(root);
    return results;
  }

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }
    await collectPortableSkillRoots(join(root, entry.name), depth + 1, results);
  }
  return results;
}

async function discoverSkills(config: SkillSpaceConfig): Promise<DiscoveredSkill[]> {
  const installed = await scanSkills(config);
  const installedRoots = new Set(installed.map((skill) => resolve(skill.root).toLowerCase()));
  const installedIds = new Set(installed.map((skill) => skill.id));
  const roots = knownExternalSkillRoots(config);
  const foundRoots = new Set<string>();

  for (const root of roots) {
    for (const found of await collectPortableSkillRoots(root)) {
      foundRoots.add(found);
    }
  }

  const discovered: DiscoveredSkill[] = [];
  for (const root of foundRoots) {
    const summary = await scanSkillFolder(root);
    if (!summary) {
      continue;
    }
    if (shouldSummarizeDescription(summary.description)) {
      const markdown = (await readTextFile(join(root, "SKILL.md"))) ?? "";
      summary.description = extractFallbackSummary(markdown);
    }
    const resolvedRoot = resolve(root).toLowerCase();
    discovered.push({
      ...summary,
      sourceRoot: root,
      installed: installedRoots.has(resolvedRoot) || installedIds.has(summary.id)
    });
  }
  return discovered.sort((a, b) => Number(a.installed) - Number(b.installed) || a.name.localeCompare(b.name));
}

async function importDiscoveredSkill(config: SkillSpaceConfig, sourceRoot: string): Promise<ImportSkillResponse> {
  const portableRoot = (await findPortableSkillRoot(sourceRoot)) ?? sourceRoot;
  if (!existsSync(join(portableRoot, "SKILL.md"))) {
    return { imported: false, message: "No SKILL.md found in that skill folder." };
  }

  const destination = await uniqueSkillRoot(config, basename(portableRoot));
  await cp(portableRoot, destination, {
    recursive: true,
    force: false,
    errorOnExist: true
  });
  await ensureSkillSpaceManifest(destination);
  let skill = await scanSkillFolder(destination);
  if (skill && shouldSummarizeDescription(skill.description)) {
    try {
      await summarizeSkill(config, skill.id);
      skill = await scanSkillFolder(destination);
    } catch {
      // Discovery import still succeeds when the LLM is unavailable.
    }
  }
  return {
    imported: Boolean(skill),
    skill: skill ?? undefined,
    message: skill ? `Imported ${skill.name}.` : "Import completed, but no valid SKILL.md was found."
  };
}

async function findSkill(config: SkillSpaceConfig, skillId: string): Promise<SkillSummary | null> {
  const skills = await scanSkills(config);
  return skills.find((skill) => skill.id === skillId) ?? null;
}

function compilePrompt(config: SkillSpaceConfig, skillMarkdown: string, input: string): string {
  return [
    "You are running a Skill-Space universal skill.",
    "Follow the SKILL.md instructions exactly, but adapt to the user's current input and workspace.",
    `Skill-Space local registry root is ${config.skillRoots[0]}.`,
    `If this run creates a new reusable skill package, create it under ${join(config.skillRoots[0], "<skill-name>")} with SKILL.md and .skillspace metadata so the desktop app can discover it automatically.`,
    "",
    "## Human confirmation policy",
    "Do not choose, approve, publish, delete, send, or finalize on behalf of the user when the skill asks for a user decision, topic selection, account choice, publish confirmation, or any numbered option.",
    "If a decision is required and the current user input does not explicitly provide it, stop after presenting the exact options or confirmation question. Say clearly that you are waiting for the user to reply in Skill-Space.",
    "Only continue through a decision step when the user input explicitly contains the choice or confirmation.",
    "",
    "## Completion quality gate",
    "Before your final response, compare the result against every required item in SKILL.md. If a required non-destructive step failed, retry that step once. If it still fails or needs user input, stop and report the exact missing item, failure reason, and next action.",
    "",
    "## SKILL.md",
    skillMarkdown,
    "",
    "## User Input",
    input || "Run this skill with its default behavior.",
    "",
    "## Output Requirements",
    "Return the final result clearly. Include any files changed, commands run, and remaining risks."
  ].join("\n");
}

function emitRunEvent(event: RunEvent): void {
  mainWindow?.webContents.send("skillspace:run-event", event);
}

function agentUsesStdinPrompt(runtime: AgentId): boolean {
  return runtime === "claude";
}

function prepareAgentArgs(agent: AgentConfig, runtime: AgentId, prompt: string): string[] {
  if (!agent.args) {
    return [];
  }

  if (agentUsesStdinPrompt(runtime)) {
    return agent.args.filter((arg) => arg !== "{{prompt}}");
  }

  return agent.args.map((arg) => (arg === "{{prompt}}" ? prompt : arg));
}

function truncateForLog(value: string, limit = 4_000): string {
  return value.length > limit ? `${value.slice(0, limit)}\n...[truncated ${value.length - limit} chars]` : value;
}

function isLikelyWaitingForInput(message: string): boolean {
  const text = powershellSingleLine(message).toLowerCase();
  if (
    /(?:已完成|完成|执行结果|任务完成|生成完成|保存完成|运行完成|无需回复|不需要回复|process exited|completed|finished|done|success)/i.test(
      text
    )
  ) {
    return false;
  }

  return [
    /(?:请|需要|等待|请你|麻烦|请回复).{0,32}(回复|选择|确认|输入|补充|提供|决定)/i,
    /(waiting for|please|need).{0,32}(reply|input|confirmation|choice|selection)/i,
    /(reply|choose|select|confirm|provide|input).{0,32}(one|option|number|choice|below)/i,
    /(?:^|\n|\s)(?:选项|候选|编号)\s*(?:1|一)[\.\、:：]/i
  ].some((pattern) => pattern.test(message) || pattern.test(text));
}

function powershellSingleLine(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function isUserDecisionRequest(message: string): boolean {
  const text = powershellSingleLine(message).toLowerCase();
  return [
    /(?:请|需要|等待|请你|麻烦|请回复|请从|请在|请告诉我|请提供|待用户|等待用户|需要用户).{0,60}(回复|选择|确认|输入|补充|提供|决定|决策|选题|编号|序号)/i,
    /(回复|选择|确认|输入|补充|提供|决定|决策).{0,40}(即可|继续|后继续|后我|后再|选题|编号|序号)/i,
    /(?:请选择|请确认|请回复|请决定|等待确认|等待回复|等待选择|需要确认|需要选择|用户确认|用户选择|用户决策)/i,
    /(?:以下|下面|候选|选项|方案).{0,120}(?:1[\.\、:：].{0,160}2[\.\、:：])/is,
    /(?:请选择|请从|回复|输入).{0,80}(?:1\s*[-~至]\s*\d|[1-9]\s*[、,，/]\s*[1-9]|编号|序号|选题|候选)/i,
    /(waiting for|please|need).{0,60}(reply|input|confirmation|choice|selection|decision)/i,
    /(reply|choose|select|confirm|provide|input).{0,60}(one|option|number|choice|below|continue)/i,
    /(?:选题|候选|方案|选项).{0,180}(?:1[\.\、:：].{0,160}2[\.\、:：])/is,
    /(?:^|\n|\s)(?:选项|候选|编号)\s*(?:1|一)[\.\、:：]/i
  ].some((pattern) => pattern.test(message) || pattern.test(text));
}

function isCompletionReportMessage(message: string): boolean {
  const text = powershellSingleLine(message).toLowerCase();
  return [
    /(?:完整\s*checklist|validation checklist|执行报告|执行总结|完整报告|最终状态\s*[:：]?.{0,12}成功|研究摘要|研究任务完成)/i,
    /(?:all checks passed|final report|execution report|validation checklist)/i,
    /(?:文章已同步|草稿箱|media_id|报告已保存|参考资料已整理|结构化研究摘要已输出)/i
  ].some((pattern) => pattern.test(message) || pattern.test(text));
}

function isActionableUserDecisionRequest(message: string): boolean {
  return isUserDecisionRequest(message) && !isCompletionReportMessage(message);
}

function isCompletionMessage(message: string): boolean {
  const text = powershellSingleLine(message).toLowerCase();
  return [
    /(?:已完成|完成|运行完成|任务完成|执行完成|成功|已生成|已保存|已上传|已同步|已发布|全部完成|无需回复|不需要回复)/i,
    /(?:completed|finished|done|success|succeeded|all checks passed|final report|execution report|no reply needed)/i,
    /(?:status|状态)\s*[:：]\s*(?:completed|done|success|已完成|完成)/i
  ].some((pattern) => pattern.test(message) || pattern.test(text));
}

function shouldTreatRunAsCompleted(run: RunSummary): boolean {
  if (!run.endedAt || run.exitCode !== 0 || !run.lastMessage) {
    return false;
  }
  return isCompletionReportMessage(run.lastMessage) || (isCompletionMessage(run.lastMessage) && !isActionableUserDecisionRequest(run.lastMessage));
}

function claudeArgsFromConfig(agent: AgentConfig, sessionId?: string): string[] {
  const args = (agent.args ?? fallbackConfig.agents.claude.args ?? []).filter((arg) => arg !== "{{prompt}}");
  if (sessionId) {
    return [...args, "--resume", sessionId];
  }
  return args;
}

function claudePowerShellCommand(promptPath: string, claudeArgs: string[]): string {
  const escapedArgs = claudeArgs.map(psSingleQuote).join(" ");
  return [
    "$OutputEncoding = [System.Text.UTF8Encoding]::new($false);",
    "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false);",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);",
    `Get-Content -Raw -Encoding UTF8 -LiteralPath ${psSingleQuote(promptPath)} | & ${psSingleQuote("claude")} ${escapedArgs}`
  ].join(" ");
}

function normalizeClaudeEvent(rawLine: string): {
  event?: Omit<RunEvent, "runId" | "timestamp">;
  sessionId?: string;
  lastMessage?: string;
  hookError?: boolean;
} {
  const line = rawLine.trim();
  if (!line) {
    return {};
  }

  try {
    const payload = JSON.parse(line) as Record<string, unknown>;
    const sessionId = typeof payload.session_id === "string" ? payload.session_id : undefined;
    const type = payload.type;

    if (type === "assistant") {
      const message = payload.message as { content?: Array<Record<string, unknown>> } | undefined;
      const parts = message?.content ?? [];
      const readable = parts
        .map((part) => {
          if (part.type === "text" && typeof part.text === "string") {
            return part.text;
          }
          if (part.type === "tool_use") {
            const name = typeof part.name === "string" ? part.name : "tool";
            const input = part.input ? truncateForLog(JSON.stringify(part.input, null, 2), 900) : "";
            return `Tool call: ${name}${input ? `\n${input}` : ""}`;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n\n");

      if (readable) {
        return {
          sessionId,
          lastMessage: readable,
          event: {
            type: readable.startsWith("Tool call: ") ? "tool" : "assistant",
            message: readable
          }
        };
      }
      return { sessionId };
    }

    if (type === "result") {
      const result = typeof payload.result === "string" ? payload.result : "";
      return {
        sessionId,
        lastMessage: result,
        event: result
          ? {
              type: "assistant",
              message: result
            }
          : undefined
      };
    }

    if (type === "user") {
      const toolResult = payload.tool_use_result as { stdout?: string; stderr?: string; interrupted?: boolean } | undefined;
      if (toolResult) {
        const output = [toolResult.stdout, toolResult.stderr].filter(Boolean).join("\n").trim();
        return {
          sessionId,
          event: output
            ? {
                type: "tool",
                message: `Tool result\n${truncateForLog(output, 1_200)}`
              }
            : undefined
        };
      }
      return { sessionId };
    }

    if (type === "system") {
      const subtype = payload.subtype;
      const output = typeof payload.output === "string" ? payload.output : "";
      const outcome = typeof payload.outcome === "string" ? payload.outcome : "";
      if (subtype === "hook_response" && outcome === "error") {
        const shortError =
          output.match(/Error:[^\r\n]+/)?.[0] ?? output.match(/[^\r\n]+/)?.[0] ?? "Claude hook returned an error.";
        return {
          sessionId,
          hookError: true,
          event: {
            type: "stderr",
            message: `Claude hook warning: ${powershellSingleLine(shortError)}`
          }
        };
      }
      return { sessionId };
    }
  } catch {
    return {
      event: {
        type: "stdout",
        message: truncateForLog(line)
      }
    };
  }

  return {};
}

function parseClaudeTextOutput(output: string): string {
  const messages = output
    .split(/\r?\n/)
    .map((line) => normalizeClaudeEvent(line).event?.message)
    .filter((message): message is string => Boolean(message?.trim()));
  return messages.at(-1)?.trim() ?? output.trim();
}

async function runClaudeText(config: SkillSpaceConfig, prompt: string, cwd: string): Promise<string> {
  const agent = config.agents.claude;
  if (!agent?.enabled || !agent.command || !agent.args) {
    throw new Error("Claude Code is not enabled for Skill-Space LLM features.");
  }

  const promptPath = join(config.artifactsRoot, `llm-${randomUUID()}.txt`);
  await writeFile(promptPath, prompt, "utf8");
  const result = await runProcess(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      claudePowerShellCommand(promptPath, claudeArgsFromConfig(agent))
    ],
    { cwd, timeoutMs: 120_000 }
  );
  const text = parseClaudeTextOutput(result.output);
  if (result.code !== 0 && !text) {
    throw new Error("Claude Code did not return a usable response.");
  }
  return text;
}

function extractFallbackSummary(markdown: string): string {
  const withoutFrontmatter = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim();
  const paragraph =
    withoutFrontmatter
      .split(/\r?\n\r?\n/)
      .map((part) => part.replace(/^#+\s*/gm, "").trim())
      .find((part) => part.length > 24) ?? "";
  return paragraph
    ? paragraph.replace(/\s+/g, " ").slice(0, 180)
    : "通用 Skill 工作流，可由 Claude、Codex、Hermes 或 OpenClaw 执行。";
}

function shouldSummarizeDescription(description: string): boolean {
  return /no description|imported portable|暂无|待补充/i.test(description) || description.trim().length < 18;
}

async function updateSkillManifestDescription(skillRoot: string, summary: string): Promise<void> {
  const manifestPath = join(skillRoot, ".skillspace", "manifest.json");
  const manifest = (await readJsonFile<Record<string, unknown>>(manifestPath)) ?? {};
  const now = new Date().toISOString();
  await writeJsonFile(manifestPath, {
    ...manifest,
    version: bumpPatchVersion(manifest.version),
    updatedAt: now,
    description: summary,
    llmSummary: {
      generatedAt: now,
      provider: "claude",
      text: summary
    }
  });
}

async function updateSkillManifestTag(skillRoot: string, tag: string): Promise<void> {
  const manifestPath = join(skillRoot, ".skillspace", "manifest.json");
  const manifest = (await readJsonFile<Record<string, unknown>>(manifestPath)) ?? {};
  const now = new Date().toISOString();
  await writeJsonFile(manifestPath, {
    ...manifest,
    version: bumpPatchVersion(manifest.version),
    updatedAt: now,
    tags: [tag],
    llmTag: {
      generatedAt: now,
      provider: "claude",
      text: tag
    }
  });
}

function fallbackSkillTag(skill: SkillSummary, markdown: string): string {
  const text = `${skill.name} ${skill.description} ${markdown}`.toLowerCase();
  if (/公众号|wechat|md2wechat|文章|选题/.test(text)) {
    return "公众号";
  }
  if (/video|剪辑|字幕|口播|remotion|heygen/.test(text)) {
    return "视频";
  }
  if (/design|ui|界面|视觉|frontend/.test(text)) {
    return "设计";
  }
  if (/test|测试|验证|audit|审计/.test(text)) {
    return "测试";
  }
  if (/deploy|ops|运维|schedule|自动化/.test(text)) {
    return "自动化";
  }
  if (/research|搜索|调研|资料/.test(text)) {
    return "研究";
  }
  if (/doc|文档|ppt|slide|sheet/.test(text)) {
    return "文档";
  }
  if (/code|开发|api|backend|frontend/.test(text)) {
    return "开发";
  }
  return "通用";
}

function cleanSkillTag(value: string): string {
  const tag = value
    .split(/\r?\n|,|，|:|：/)
    .map((item) => item.trim())
    .find(Boolean) ?? "";
  return tag.replace(/[^\p{Script=Han}A-Za-z0-9_-]/gu, "").slice(0, 8) || "通用";
}

async function summarizeSkill(config: SkillSpaceConfig, skillId: string): Promise<{ skill: SkillSummary; summary: string }> {
  const skill = await findSkill(config, skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  const markdown = (await readTextFile(join(skill.root, "SKILL.md"))) ?? "";
  let summary = extractFallbackSummary(markdown);
  try {
    summary = await runClaudeText(
      config,
      [
        "请阅读下面的 SKILL.md，为 Skill-Space 技能库生成一段中文说明。",
        "要求：只输出一段 50 到 90 个中文字符的说明，说明这个技能解决什么问题、适合何时使用，不要输出列表。",
        "",
        markdown.slice(0, 12_000)
      ].join("\n"),
      skill.root
    );
    summary = summary.replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").slice(0, 220);
  } catch {
    // Fallback keeps manual import usable when the local LLM is offline.
  }

  await updateSkillManifestDescription(skill.root, summary);
  const refreshed = await scanSkillFolder(skill.root);
  return { skill: refreshed ?? { ...skill, description: summary }, summary };
}

function extractTaggedSection(value: string, tag: string): string | undefined {
  const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`, "i");
  return value.match(pattern)?.[1]?.trim();
}

function extractEditedSkillMarkdown(value: string): string | undefined {
  const tagged = extractTaggedSection(value, "skill-md");
  if (tagged) {
    return tagged;
  }
  const fenced = value.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  return fenced;
}

async function editSkillWithLlm(config: SkillSpaceConfig, request: EditSkillWithLlmRequest): Promise<EditSkillWithLlmResponse> {
  const instruction = request.instruction.trim();
  if (!instruction) {
    throw new Error("请先输入要如何修改这个技能。");
  }

  const skill = await findSkill(config, request.skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${request.skillId}`);
  }

  const skillPath = join(skill.root, "SKILL.md");
  const markdown = (await readTextFile(skillPath)) ?? "";
  const result = await callConfiguredLlm(
    config,
    [
      skillSpaceStewardIdentity(),
      "",
      "你正在帮助用户修改一个 Skill-Space 技能包的 SKILL.md。",
      "请根据用户要求直接产出修改后的完整 SKILL.md，不要修改技能目录中的其他文件。",
      "除非用户明确要求，否则保留原来的 frontmatter、技能名称、执行边界和安全约束。",
      "如果用户要求不清晰，请做保守、可逆、局部的改动。",
      "",
      "输出格式必须严格为：",
      "<summary>用中文简短说明你改了什么</summary>",
      "<skill-md>",
      "完整的 SKILL.md 内容",
      "</skill-md>",
      "",
      "用户修改要求：",
      instruction,
      "",
      "当前 SKILL.md：",
      markdown.slice(0, 40_000)
    ].join("\n")
  );

  const nextMarkdown = extractEditedSkillMarkdown(result);
  if (!nextMarkdown || nextMarkdown.length < 40) {
    throw new Error("LLM 没有返回可写入的完整 SKILL.md。");
  }

  const summary = extractTaggedSection(result, "summary") ?? "已根据你的要求修改 SKILL.md。";
  await writeFile(skillPath, `${nextMarkdown.trim()}\n`, "utf8");
  await ensureSkillSpaceManifest(skill.root);
  await bumpSkillManifestVersion(skill.root, "llm-edit");
  await scanSkills(config);
  return {
    skill: await getSkillDetail(config, request.skillId),
    summary: summary.replace(/\s+/g, " ").slice(0, 500)
  };
}

async function classifySkillTags(config: SkillSpaceConfig): Promise<ClassifySkillTagsResponse> {
  const skills = await scanSkills(config);

  for (const skill of skills) {
    const markdown = (await readTextFile(join(skill.root, "SKILL.md"))) ?? "";
    let tag = fallbackSkillTag(skill, markdown);
    try {
      const llmTag = await runClaudeText(
        config,
        [
          "请为下面这个 Skill-Space 技能选择一个最准确的中文单标签。",
          "规则：只输出一个标签，不要解释，不要标点，2 到 6 个中文字符。",
          "优先从这些标签中选择：公众号、写作、开发、测试、设计、数据、自动化、运维、研究、视频、文档、通用。",
          "",
          `技能名：${skill.name}`,
          `说明：${skill.description}`,
          "",
          markdown.slice(0, 6_000)
        ].join("\n"),
        skill.root
      );
      tag = cleanSkillTag(llmTag);
    } catch {
      // Keep classification usable when the local LLM is offline.
    }

    await updateSkillManifestTag(skill.root, tag);
  }

  return { skills: await scanSkills(config) };
}

async function getLlmStatus(config: SkillSpaceConfig): Promise<LlmManagerStatus> {
  return llmStatusFromConfig(await readLlmConfig(config));
}

async function saveLlmConfig(config: SkillSpaceConfig, request: SaveLlmConfigRequest): Promise<LlmManagerStatus> {
  const existing = await readLlmConfig(config);
  const provider = request.provider;
  const defaults = llmProviderDefaults[provider] ?? llmProviderDefaults["openai-compatible"];
  const model = request.model.trim() || defaults.model;
  const baseUrl = request.baseUrl?.trim() || defaults.baseUrl;
  const apiKey = request.apiKey?.trim()
    ? encryptSecret(request.apiKey.trim())
    : existing?.encryptedApiKey;

  await writeLlmConfig(config, {
    schemaVersion: "skillspace.llm.v1",
    enabled: request.enabled,
    provider,
    model,
    baseUrl,
    encryptedApiKey: apiKey,
    updatedAt: new Date().toISOString()
  });

  return getLlmStatus(config);
}

function skillSpaceStewardIdentity(): string {
  return [
    "你是 Skill-Space 管家，一个嵌入 Skill-Space 桌面应用的独立 LLM。",
    "你的职责不是替代 Claude Code、Codex、Hermes 或 OpenClaw 执行任务，而是理解应用状态、解释技能、整理运行结果、规划自动化、协助飞书远程确认，并给出可执行建议。",
    "你了解 Skill-Space 的核心能力：管理通用 SKILL.md 技能包、扫描和导入本机技能、选择执行智能体运行技能、维护运行历史和产物、支持定时自动化、支持飞书消息通知和远程回复、支持在线更新。",
    "回答默认使用中文，简洁、具体、可操作。涉及风险、失败或权限时要直接说明原因和下一步。"
  ].join("\n");
}

function buildSkillSpaceContext(
  config: SkillSpaceConfig,
  skills: SkillSummary[],
  runs: RunSummary[],
  schedules: ScheduledTask[],
  agents: AgentHealth[],
  feishuStatus: FeishuStatus,
  skill?: SkillSummary,
  run?: RunSummary
): string {
  return JSON.stringify(
    {
      app: {
        name: "Skill-Space",
        version: app.getVersion(),
        dataRoot: config.dataRoot,
        defaultRuntime: config.defaultRuntime,
        permissionsMode: config.permissionsMode
      },
      selectedSkill: skill
        ? {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            tags: skill.tags,
            runtimes: skill.runtimes
          }
        : null,
      selectedRun: run
        ? {
            id: run.runId,
            skillName: run.skillName,
            status: run.status,
            runtime: run.runtime,
            startedAt: run.startedAt,
            lastMessage: run.lastMessage,
            diagnostic: run.diagnostic
          }
        : null,
      inventory: {
        skillCount: skills.length,
        recentSkills: skills.slice(0, 12).map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          tags: item.tags,
          updatedAt: item.updatedAt
        })),
        recentRuns: runs.slice(0, 8).map((item) => ({
          id: item.runId,
          skillName: item.skillName,
          status: item.status,
          runtime: item.runtime,
          startedAt: item.startedAt
        })),
        schedules: schedules.slice(0, 8).map((item) => ({
          name: item.name,
          skillName: item.skillName,
          enabled: item.enabled,
          cadence: item.cadence,
          nextRunAt: item.nextRunAt
        })),
        agents: agents.map((item) => ({
          id: item.id,
          label: item.label,
          enabled: item.enabled,
          status: item.status,
          detail: item.detail
        })),
        feishu: {
          enabled: feishuStatus.enabled,
          state: feishuStatus.state,
          connected: feishuStatus.connected,
          lastEventAt: feishuStatus.lastEventAt,
          lastError: feishuStatus.lastError
        }
      }
    },
    null,
    2
  );
}

async function callConfiguredLlm(config: SkillSpaceConfig, prompt: string): Promise<string> {
  const stored = (await readLlmConfig(config)) ?? defaultLlmConfig();
  if (!stored.enabled) {
    throw new Error("Skill-Space 管家已关闭。");
  }

  if (stored.provider === "claude-code") {
    return runClaudeText(config, prompt, config.dataRoot);
  }

  if (stored.provider === "ollama") {
    const response = await fetch(`${stored.baseUrl ?? "http://127.0.0.1:11434"}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: stored.model,
        stream: false,
        messages: [
          { role: "system", content: skillSpaceStewardIdentity() },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }
    const data = (await response.json()) as { message?: { content?: string } };
    return data.message?.content?.trim() || "Ollama 没有返回内容。";
  }

  const apiKey = stored.encryptedApiKey ? decryptSecret(stored.encryptedApiKey) : "";
  if (!apiKey) {
    throw new Error("请先在设置中填写 LLM API Key。");
  }
  const baseUrl = (stored.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: stored.model,
      messages: [
        { role: "system", content: skillSpaceStewardIdentity() },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    })
  });
  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() || "LLM 没有返回内容。";
}

async function askLlm(config: SkillSpaceConfig, request: LlmAnalyzeRequest): Promise<LlmAnalyzeResponse> {
  const skills = await scanSkills(config);
  const runs = await listRuns(config);
  const schedules = await listSchedules(config);
  const agents = await checkAgents(config);
  const feishu = await getFeishuStatus(config);
  const skill = request.skillId ? skills.find((item) => item.id === request.skillId) : undefined;
  const run = request.runId ? runs.find((item) => item.runId === request.runId) : undefined;
  const result = await callConfiguredLlm(
    config,
    [
      skillSpaceStewardIdentity(),
      "",
      "以下是当前应用上下文，请基于它回答：",
      `当前时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      buildSkillSpaceContext(config, skills, runs, schedules, agents, feishu, skill, run),
      "",
      "最近对话上下文：",
      formatConversationHistory(request.history ?? []),
      "",
      "用户请求：",
      request.prompt
    ].join("\n")
  );
  return { result };
}

const backgroundTaskName = "Skill-Space Background Scheduler";

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function writeBackgroundSchedulerScript(config: SkillSpaceConfig): Promise<string> {
  const scriptPath = backgroundSchedulerScriptPath(config);
  const wrapperPath = backgroundSchedulerWrapperPath(config);
  const appPath = app.getAppPath();
  const argumentList = app.isPackaged
    ? "@('--background-scheduler')"
    : `@(${quotePowerShell(appPath)}, '--background-scheduler')`;
  const command = app.isPackaged
    ? `Start-Process -FilePath ${quotePowerShell(process.execPath)} -ArgumentList ${argumentList} -WindowStyle Hidden`
    : `Start-Process -FilePath ${quotePowerShell(process.execPath)} -ArgumentList ${argumentList} -WorkingDirectory ${quotePowerShell(appPath)} -WindowStyle Hidden`;
  await writeFile(
    scriptPath,
    ["$ErrorActionPreference = 'SilentlyContinue'", command, ""].join("\r\n"),
    "utf8"
  );
  await writeFile(
    wrapperPath,
    [
      'Set shell = CreateObject("WScript.Shell")',
      `shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""${scriptPath}""", 0, False`,
      ""
    ].join("\r\n"),
    "utf8"
  );
  return scriptPath;
}

type ScheduledTaskProbe = {
  found?: boolean;
  state?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastResult?: string;
  action?: string;
};

async function queryBackgroundSchedulerTask(): Promise<ScheduledTaskProbe | null> {
  const command = [
    `$task = Get-ScheduledTask -TaskName ${quotePowerShell(backgroundTaskName)} -ErrorAction SilentlyContinue`,
    "if ($null -eq $task) {",
    "  [pscustomobject]@{ found = $false; state = 'NotInstalled'; nextRunAt = ''; lastRunAt = ''; lastResult = ''; action = '' } | ConvertTo-Json -Compress",
    "} else {",
    `  $info = Get-ScheduledTaskInfo -TaskName ${quotePowerShell(backgroundTaskName)} -ErrorAction SilentlyContinue`,
    "  $action = ($task.Actions | Select-Object -First 1)",
    "  $lastRun = if ($info.LastRunTime -and $info.LastRunTime.Year -gt 1900) { $info.LastRunTime.ToString('s') } else { '' }",
    "  $nextRun = if ($info.NextRunTime -and $info.NextRunTime.Year -gt 1900) { $info.NextRunTime.ToString('s') } else { '' }",
    "  [pscustomobject]@{ found = $true; state = [string]$task.State; nextRunAt = $nextRun; lastRunAt = $lastRun; lastResult = [string]$info.LastTaskResult; action = ([string]$action.Execute + ' ' + [string]$action.Arguments) } | ConvertTo-Json -Compress",
    "}"
  ].join("; ");
  const result = await runProcess("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    timeoutMs: 8_000
  });
  return result.output ? JSON.parse(result.output) as ScheduledTaskProbe : null;
}

async function installBackgroundSchedulerTask(config: SkillSpaceConfig): Promise<void> {
  await writeBackgroundSchedulerScript(config);
  const wrapperPath = backgroundSchedulerWrapperPath(config);
  const result = await runProcess(
    "schtasks.exe",
    [
      "/Create",
      "/SC",
      "MINUTE",
      "/MO",
      "5",
      "/TN",
      backgroundTaskName,
      "/TR",
      `wscript.exe "${wrapperPath}"`,
      "/F"
    ],
    { timeoutMs: 12_000 }
  );
  if (result.code !== 0) {
    throw new Error(result.output || `schtasks create failed with code ${result.code}`);
  }
}

async function getBackgroundSchedulerStatus(config: SkillSpaceConfig): Promise<BackgroundSchedulerStatus> {
  const recentErrors = await readSchedulerErrors(config);
  const latestError = recentErrors?.[0];
  if (process.platform !== "win32") {
    return {
      supported: false,
      enabled: false,
      taskName: backgroundTaskName,
      detail: "Windows Task Scheduler is only available on Windows.",
      silent: false,
      lastErrorAt: latestError?.at,
      lastError: latestError?.message,
      recentErrors
    };
  }

  let probe = await queryBackgroundSchedulerTask();
  const found = Boolean(probe?.found);
  const silent = Boolean(probe?.action?.toLowerCase().includes("wscript.exe"));
  if (found && !silent) {
    await installBackgroundSchedulerTask(config);
    probe = await queryBackgroundSchedulerTask();
  }

  const enabled = Boolean(probe?.found && probe.state !== "Disabled");
  return {
    supported: true,
    enabled,
    taskName: backgroundTaskName,
    detail: enabled
      ? "后台计划任务已安装，会每 5 分钟静默检查到期自动化。"
      : "后台计划任务未安装，开启后将每 5 分钟静默检查自动化。",
    state: probe?.state,
    nextRunAt: probe?.nextRunAt,
    lastRunAt: probe?.lastRunAt,
    lastResult: probe?.lastResult,
    silent: Boolean(probe?.action?.toLowerCase().includes("wscript.exe")),
    lastErrorAt: latestError?.at,
    lastError: latestError?.message,
    recentErrors
  };
}

async function setBackgroundScheduler(config: SkillSpaceConfig, enabled: boolean): Promise<BackgroundSchedulerStatus> {
  if (process.platform !== "win32") {
    return getBackgroundSchedulerStatus(config);
  }

  if (!enabled) {
    const result = await runProcess("schtasks.exe", ["/Delete", "/TN", backgroundTaskName, "/F"], { timeoutMs: 8_000 });
    if (result.code !== 0) {
      await appendSchedulerError(config, {
        phase: "disable",
        message: result.output || `schtasks delete failed with code ${result.code}`
      });
    }
    return getBackgroundSchedulerStatus(config);
  }

  try {
    await installBackgroundSchedulerTask(config);
  } catch (error) {
    await appendSchedulerError(config, {
      phase: "enable",
      message: error instanceof Error ? error.message : String(error)
    });
  }
  return getBackgroundSchedulerStatus(config);
}

function createLineParser(onLine: (line: string) => void): (chunk: string) => void {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      onLine(line);
    }
  };
}

async function executeRun(
  config: SkillSpaceConfig,
  runSummary: RunSummary,
  command: string,
  args: string[],
  options: { cwd: string; prompt?: string; runtime: AgentId; appendTurn?: string }
): Promise<void> {
  const appendLog = async (event: RunEvent): Promise<void> => {
    await writeFile(runSummary.logPath, `${JSON.stringify(event)}\n`, { flag: "a" });
  };
  const updateRunSummary = async (patch: Partial<RunSummary>): Promise<void> => {
    Object.assign(runSummary, patch);
    await writeRunSummary(runSummary);
  };

  const startedEvent: RunEvent = {
    runId: runSummary.runId,
    type: options.appendTurn ? "user" : "started",
    message: options.appendTurn ?? `${config.agents[options.runtime].label} started ${runSummary.skillName}.`,
    timestamp: new Date().toISOString()
  };
  await appendLog(startedEvent);
  emitRunEvent(startedEvent);

  let child;
  try {
    child = spawn(command, args, {
      cwd: options.cwd,
      env: config.agents[options.runtime].env ? { ...process.env, ...config.agents[options.runtime].env } : process.env,
      windowsHide: true,
      shell: shouldUseShell(command)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = new Date().toISOString();
    const event: RunEvent = {
      runId: runSummary.runId,
      type: "error",
      message,
      timestamp: failedAt
    };
    await appendLog(event);
    await updateRunSummary({ status: "failed", endedAt: failedAt, diagnostic: message });
    emitRunEvent(event);
    throw error;
  }

  let codexTurnCompleted = false;
  let outputSuggestsEmptyPrompt = false;
  let hookErrorSeen = false;
  let lastMessage = "";
  let waitingSignalSeen = false;
  let waitingSignalMessage = "";
  let sessionId = runSummary.sessionId;

  if (options.prompt && agentUsesStdinPrompt(options.runtime) && child.stdin.writable) {
    child.stdin.end(options.prompt);
  }

  const emitParsed = (event: Omit<RunEvent, "runId" | "timestamp">): void => {
    const fullEvent: RunEvent = {
      runId: runSummary.runId,
      ...event,
      message: truncateForLog(event.message),
      timestamp: new Date().toISOString()
    };
    void appendLog(fullEvent);
    emitRunEvent(fullEvent);
  };

  const parseClaudeLine = createLineParser((line) => {
    const parsed = normalizeClaudeEvent(line);
    if (parsed.sessionId) {
      sessionId = parsed.sessionId;
      void updateRunSummary({ sessionId });
    }
    if (parsed.lastMessage) {
      lastMessage = parsed.lastMessage;
      if (isCompletionMessage(parsed.lastMessage)) {
        waitingSignalSeen = false;
        waitingSignalMessage = "";
      } else if (isUserDecisionRequest(parsed.lastMessage)) {
        waitingSignalSeen = true;
        waitingSignalMessage = parsed.lastMessage;
      }
    }
    if (parsed.hookError) {
      hookErrorSeen = true;
    }
    if (parsed.event) {
      emitParsed(parsed.event);
    }
  });

  child.stdout.on("data", (chunk: Buffer) => {
    const output = chunk.toString();
    if (output.includes("message got cut off") || output.includes("What would you like me to help with?")) {
      outputSuggestsEmptyPrompt = true;
    }
    if (options.runtime === "codex" && output.includes('"type":"turn.completed"') && !codexTurnCompleted) {
      codexTurnCompleted = true;
      setTimeout(() => {
        if (!child.killed) {
          child.kill();
        }
      }, 750);
    }

    if (options.runtime === "claude") {
      parseClaudeLine(output);
      return;
    }

    emitParsed({ type: "stdout", message: output });
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const output = chunk.toString();
    if (output.includes("no stdin data received")) {
      outputSuggestsEmptyPrompt = true;
    }
    emitParsed({ type: "stderr", message: output });
  });

  child.on("error", (error) => {
    const failedAt = new Date().toISOString();
    const event: RunEvent = {
      runId: runSummary.runId,
      type: "error",
      message: error.message,
      timestamp: failedAt
    };
    void appendLog(event);
    void updateRunSummary({ status: "failed", endedAt: failedAt, diagnostic: error.message });
    emitRunEvent(event);
  });

  child.on("close", (code) => {
    const endedAt = new Date().toISOString();
    const canComplete = (code === 0 || codexTurnCompleted) && !outputSuggestsEmptyPrompt;
    const lastMessageIsWaiting = lastMessage ? isActionableUserDecisionRequest(lastMessage) : false;
    const lastMessageCompleted = lastMessage
      ? isCompletionReportMessage(lastMessage) || (isCompletionMessage(lastMessage) && !lastMessageIsWaiting)
      : false;
    const waiting = canComplete && !lastMessageCompleted && (lastMessageIsWaiting || (!lastMessage && waitingSignalSeen));
    const waitingMessage = lastMessageIsWaiting ? lastMessage : !lastMessage ? waitingSignalMessage : "";
    const status =
      canComplete
        ? waiting
          ? "waiting_input"
          : "completed"
        : "failed";
    const event: RunEvent = {
      runId: runSummary.runId,
      type: "closed",
      message: waiting ? "Waiting for your reply." : `Process exited with code ${code ?? "unknown"}.`,
      timestamp: endedAt
    };
    void appendLog(event);
    void updateRunSummary({
      status,
      endedAt,
      exitCode: code,
      sessionId,
      lastMessage: waitingMessage || lastMessage || runSummary.lastMessage,
      diagnostic:
        status === "failed"
          ? outputSuggestsEmptyPrompt
            ? "Agent did not receive the prompt."
            : runSummary.diagnostic
          : hookErrorSeen
            ? "Claude startup hook emitted warnings, but the run completed."
            : runSummary.diagnostic
    });
    void notifyFeishuRun(config, waiting ? "需要确认" : status === "completed" ? "运行完成" : "运行失败", [
      `技能：${runSummary.skillName}`,
      `状态：${feishuStatusLabel(status)}`,
      `执行智能体：${runSummary.runtime}`,
      `运行 ID：${runSummary.runId}`,
      waiting && waitingMessage ? `需要回复：${truncateForLog(waitingMessage, 8_000)}` : "",
      status === "failed" && runSummary.diagnostic ? `诊断：${runSummary.diagnostic}` : ""
    ]);
    emitRunEvent(event);
  });
}

async function runSkill(config: SkillSpaceConfig, request: RunSkillRequest): Promise<RunSkillResponse> {
  const skill = await findSkill(config, request.skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${request.skillId}`);
  }

  const agent = config.agents[request.runtime];
  if (!agent?.enabled || !agent.command || !agent.args) {
    throw new Error(`Agent is not enabled: ${request.runtime}`);
  }

  const runId = randomUUID();
  const runRoot = join(config.runsRoot, runId);
  await mkdir(runRoot, { recursive: true });

  const skillMarkdown = await readFile(join(skill.root, "SKILL.md"), "utf8");
  const prompt = compilePrompt(config, skillMarkdown, request.input);
  let args = prepareAgentArgs(agent, request.runtime, prompt);
  let command = windowsCommand(agent.command);
  const startedAt = new Date().toISOString();
  const logPath = join(runRoot, "events.jsonl");
  let runSummary: RunSummary = {
    runId,
    skillId: skill.id,
    skillName: skill.name,
    runtime: request.runtime,
    status: "running",
    startedAt,
    input: request.input,
    runRoot,
    logPath
  };
  await writeRunSummary(runSummary);
  void notifyFeishuRun(config, "运行已启动", [
    `技能：${skill.name}`,
    `状态：运行中`,
    `执行智能体：${request.runtime}`,
    `运行 ID：${runId}`
  ]);

  let promptForStdin: string | undefined = prompt;
  if (request.runtime === "claude") {
    const promptPath = join(runRoot, "prompt.txt");
    await writeFile(promptPath, prompt, "utf8");
    command = "powershell.exe";
    args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      claudePowerShellCommand(promptPath, claudeArgsFromConfig(agent))
    ];
    promptForStdin = undefined;
  }

  void executeRun(config, runSummary, command, args, {
    cwd: skill.root,
    prompt: promptForStdin,
    runtime: request.runtime
  });

  return { runId };
}

async function continueRun(config: SkillSpaceConfig, request: ContinueRunRequest): Promise<ContinueRunResponse> {
  const runSummary = await readJsonFile<RunSummary>(runSummaryPath(config, request.runId));
  if (!runSummary) {
    throw new Error(`Run not found: ${request.runId}`);
  }
  if (!isPathInside(config.runsRoot, runSummary.runRoot)) {
    throw new Error("Refusing to continue a run outside the runs directory.");
  }

  if (runSummary.runtime !== "claude") {
    throw new Error("Continuing a run is currently supported for Claude Code sessions.");
  }

  if (!runSummary.sessionId) {
    throw new Error("This run does not have a Claude session id yet.");
  }

  const skill = await findSkill(config, runSummary.skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${runSummary.skillId}`);
  }

  const agent = config.agents[runSummary.runtime];
  if (!agent?.enabled || !agent.command || !agent.args) {
    throw new Error(`Agent is not enabled: ${runSummary.runtime}`);
  }

  const turnId = randomUUID();
  const promptPath = join(runSummary.runRoot, `reply-${turnId}.txt`);
  await writeFile(promptPath, request.input, "utf8");
  await writeRunSummary({
    ...runSummary,
    status: "running",
    endedAt: undefined,
    input: `${runSummary.input}\n\n--- follow-up ---\n${request.input}`.trim()
  });

  const refreshedRun = (await readJsonFile<RunSummary>(runSummaryPath(config, request.runId))) ?? runSummary;
  void executeRun(
    config,
    refreshedRun,
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      claudePowerShellCommand(promptPath, claudeArgsFromConfig(agent, runSummary.sessionId))
    ],
    {
      cwd: skill.root,
      runtime: runSummary.runtime,
      appendTurn: request.input
    }
  );

  return { runId: request.runId };
}

async function runDueSchedules(config: SkillSpaceConfig): Promise<number> {
  const now = new Date();
  const schedules = await listSchedules(config);
  let changed = false;
  let started = 0;

  for (let index = 0; index < schedules.length; index += 1) {
    const task = schedules[index];
    if (!task.enabled || new Date(task.nextRunAt) > now) {
      continue;
    }

    const nextTask: ScheduledTask = {
      ...task,
      enabled: task.cadence === "once" ? false : task.enabled,
      lastRunAt: now.toISOString(),
      nextRunAt: task.cadence === "once" ? task.nextRunAt : nextScheduleDate(task, now).toISOString()
    };
    schedules[index] = nextTask;
    changed = true;

    try {
      const response = await runSkill(config, {
        skillId: task.skillId,
        runtime: task.runtime,
        input: [
          task.input,
          "",
          "[Skill-Space 自动化触发]",
          `任务：${task.name}`,
          `触发时间：${now.toISOString()}`
        ].join("\n").trim()
      });
      started += 1;
      schedules[index] = { ...nextTask, lastRunId: response.runId };
    } catch (error) {
      await appendSchedulerError(config, {
        phase: "run-due-schedule",
        message: error instanceof Error ? error.message : String(error),
        taskId: task.id,
        taskName: task.name,
        skillId: task.skillId
      });
      schedules[index] = nextTask;
    }
  }

  if (changed) {
    await writeSchedules(config, schedules);
  }

  return started;
}

function startScheduler(): void {
  if (schedulerTimer) {
    return;
  }

  schedulerTimer = setInterval(() => {
    void ensureConfig()
      .then((config) => runDueSchedules(config).catch((error) =>
        appendSchedulerError(config, {
          phase: "scheduler-loop",
          message: error instanceof Error ? error.message : String(error)
        })
      ));
  }, 30_000);
  void ensureConfig().then((config) =>
    runDueSchedules(config).catch((error) =>
      appendSchedulerError(config, {
        phase: "scheduler-start",
        message: error instanceof Error ? error.message : String(error)
      })
    )
  );
}

function setUpdateStatus(next: Partial<UpdateStatus>): UpdateStatus {
  updateStatus = {
    ...updateStatus,
    currentVersion: app.getVersion(),
    ...next
  };
  mainWindow?.webContents.send("skillspace:update-status-changed", updateStatus);
  return updateStatus;
}

function stringifyReleaseNotes(notes: unknown): string | undefined {
  if (!notes) {
    return undefined;
  }
  if (typeof notes === "string") {
    return notes;
  }
  if (Array.isArray(notes)) {
    return notes
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object") {
          const entry = item as { version?: string; note?: string };
          return [entry.version, entry.note].filter(Boolean).join("\n");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return String(notes);
}

function defaultReleaseNotes(version?: string): string {
  if (version === "0.1.25") {
    return [
      "Skill-Space 0.1.25",
      "- 修复在线更新下载缺少实时反馈的问题。",
      "- 更新弹窗现在会保留并显示下载状态、完成状态或错误信息。",
      "- 修复同 ID 本地模板遮挡云端模板，导致云端库显示 0 的问题。",
      "- 云端工作流库刷新会绕过缓存，优先展示服务器模板。"
    ].join("\n");
  }
  if (version === "0.1.24") {
    return [
      "Skill-Space 0.1.24",
      "- 修复工作流上传后云端库显示为空的问题。",
      "- 智能体扫描改为手动触发，不再进入页面自动弹窗。",
      "- 优化中等窗口布局和智能体扫描弹窗视觉。"
    ].join("\n");
  }
  return version ? `Skill-Space ${version} 更新。` : "Skill-Space 更新。";
}

function updateReleaseFields(info: { version?: string; releaseName?: string | null; releaseNotes?: unknown; releaseDate?: string | null }): Partial<UpdateStatus> {
  const releaseNotes = stringifyReleaseNotes(info.releaseNotes);
  return {
    availableVersion: info.version,
    releaseName: info.releaseName ?? undefined,
    releaseNotes: releaseNotes || defaultReleaseNotes(info.version),
    releaseDate: info.releaseDate ?? undefined
  };
}

function compareVersionPart(left: string, right: string): number {
  const leftNumber = Number(left.replace(/\D.*$/, ""));
  const rightNumber = Number(right.replace(/\D.*$/, ""));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber > rightNumber ? 1 : -1;
  }
  return left.localeCompare(right);
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(/[.-]/).filter(Boolean);
  const rightParts = right.split(/[.-]/).filter(Boolean);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const result = compareVersionPart(leftParts[index] ?? "0", rightParts[index] ?? "0");
    if (result !== 0) {
      return result;
    }
  }
  return 0;
}

function isUpdateNewer(version?: string): boolean {
  return Boolean(version && compareVersions(version, app.getVersion()) > 0);
}

function markNoNewerUpdate(version?: string): UpdateStatus {
  return setUpdateStatus({
    state: "not_available",
    detail: version
      ? `当前版本 ${app.getVersion()} 不低于更新源版本 ${version}，已忽略。`
      : `当前版本 ${app.getVersion()} 已是最新。`,
    availableVersion: undefined,
    releaseName: undefined,
    releaseNotes: undefined,
    releaseDate: undefined,
    downloaded: false
  });
}

function configureAutoUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus({
      state: "checking",
      detail: "正在检查更新...",
      lastCheckedAt: new Date().toISOString(),
      error: undefined
    });
  });
  autoUpdater.on("update-available", (info) => {
    if (!isUpdateNewer(info.version)) {
      markNoNewerUpdate(info.version);
      return;
    }

    setUpdateStatus({
      state: "available",
      detail: `发现新版本 ${info.version}。`,
      ...updateReleaseFields(info),
      downloaded: false
    });
  });
  autoUpdater.on("update-not-available", () => {
    setUpdateStatus({
      state: "not_available",
      detail: "当前已经是最新版本。",
      availableVersion: undefined,
      releaseName: undefined,
      releaseNotes: undefined,
      releaseDate: undefined,
      downloaded: false
    });
  });
  autoUpdater.on("download-progress", (progress) => {
    setUpdateStatus({
      state: "downloading",
      detail: `正在下载更新：${Math.round(progress.percent)}%`
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    if (!isUpdateNewer(info.version)) {
      markNoNewerUpdate(info.version);
      return;
    }

    setUpdateStatus({
      state: "downloaded",
      detail: `版本 ${info.version} 已下载，重启后安装。`,
      ...updateReleaseFields(info),
      downloaded: true
    });
  });
  autoUpdater.on("error", (error) => {
    setUpdateStatus({
      state: "error",
      detail: "更新检查失败。",
      error: error.message
    });
  });
}

async function getUpdateStatus(): Promise<UpdateStatus> {
  return updateStatus;
}

async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return setUpdateStatus({
      state: "not_available",
      detail: "开发模式不会连接更新源，打包安装版才会检查在线更新。",
      lastCheckedAt: new Date().toISOString()
    });
  }
  setUpdateStatus({
    state: "checking",
    detail: "正在检查更新...",
    lastCheckedAt: new Date().toISOString(),
    error: undefined
  });
  const result = await autoUpdater.checkForUpdates();
  if (result?.updateInfo && isUpdateNewer(result.updateInfo.version)) {
    setUpdateStatus({
      state: "available",
      detail: `发现新版本 ${result.updateInfo.version}。`,
      ...updateReleaseFields(result.updateInfo),
      downloaded: false
    });
  } else if (result?.updateInfo) {
    markNoNewerUpdate(result.updateInfo.version);
  }
  return updateStatus;
}
async function downloadUpdate(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return checkForUpdates();
  }
  if (updateStatus.availableVersion && !isUpdateNewer(updateStatus.availableVersion)) {
    return markNoNewerUpdate(updateStatus.availableVersion);
  }

  try {
    setUpdateStatus({ state: "downloading", detail: "正在下载更新..." });
    await autoUpdater.downloadUpdate();
    return updateStatus;
  } catch (error) {
    return setUpdateStatus({
      state: "error",
      detail: "下载更新失败。",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
async function installUpdate(): Promise<void> {
  autoUpdater.quitAndInstall(false, true);
}

function showMainWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function ensureTray(): void {
  if (tray) {
    return;
  }
  tray = new Tray(appIconPath);
  tray.setToolTip("Skill-Space");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开 Skill-Space", click: () => showMainWindow() },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
  tray.on("double-click", () => showMainWindow());
}

async function bootstrap(): Promise<BootstrapPayload> {
  const config = await ensureConfig();
  void ensureFeishuChannel(config);
  const [agents, skills, runs, schedules] = await Promise.all([
    checkAgents(config),
    scanSkills(config),
    listRuns(config),
    listSchedules(config)
  ]);
  return { config, agents, skills, runs, schedules };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: "#eef3f7",
    title: "Skill-Space",
    icon: appIconPath,
    frame: false,
    skipTaskbar: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("close", (event) => {
    if (!isQuitting && closeToTrayEnabled) {
      event.preventDefault();
      ensureTray();
      mainWindow?.setSkipTaskbar(true);
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

if (!isBackgroundSchedulerProcess) {
  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
    process.exit(0);
  } else {
    app.on("second-instance", () => showMainWindow());
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.skillspace.desktop");
  configureAutoUpdater();

  if (isBackgroundSchedulerProcess) {
    void ensureConfig()
      .then((config) =>
        runDueSchedules(config).catch(async (error) => {
          await appendSchedulerError(config, {
            phase: "background-scheduler",
            message: error instanceof Error ? error.message : String(error)
          });
          return 0;
        })
      )
      .then((started) => {
        setTimeout(() => app.quit(), started > 0 ? 30 * 60_000 : 5_000);
      })
      .catch(async (error) => {
        const config = await ensureConfig().catch(() => null);
        if (config) {
          await appendSchedulerError(config, {
            phase: "background-scheduler-bootstrap",
            message: error instanceof Error ? error.message : String(error)
          });
        }
        setTimeout(() => app.quit(), 5_000);
      });
    return;
  }

  void ensureConfig().then((config) => {
    closeToTrayEnabled = Boolean(config.window.closeToTray);
    if (closeToTrayEnabled) {
      ensureTray();
    }
  });

  ipcMain.handle("skillspace:bootstrap", () => bootstrap());
  ipcMain.handle("skillspace:agents", async () => checkAgents(await ensureConfig()));
  ipcMain.handle("skillspace:agent-candidates", async () => detectAgentCandidates(await ensureConfig()));
  ipcMain.handle("skillspace:agent-save", async (_, request: SaveAgentConfigRequest) =>
    saveAgentConfig(await ensureConfig(), request)
  );
  ipcMain.handle("skillspace:agent-test", async (_, request: SaveAgentConfigRequest) =>
    testAgentConfig(await ensureConfig(), request)
  );
  ipcMain.handle("skillspace:agent-delete", async (_, agentId: AgentId) =>
    deleteAgentConfig(await ensureConfig(), agentId)
  );
  ipcMain.handle("skillspace:storage-choose", () => chooseStorageRoot());
  ipcMain.handle("skillspace:storage-save", async (_, request: SaveStorageRootRequest) =>
    saveStorageRoot(await ensureConfig(), request)
  );
  ipcMain.handle("skillspace:skills", async () => scanSkills(await ensureConfig()));
  ipcMain.handle("skillspace:discover-skills", async () => discoverSkills(await ensureConfig()));
  ipcMain.handle("skillspace:import-discovered-skill", async (_, root: string) =>
    importDiscoveredSkill(await ensureConfig(), root)
  );
  ipcMain.handle("skillspace:skill-changes", async () => listSkillChanges(await ensureConfig()));
  ipcMain.handle("skillspace:runs", async () => listRuns(await ensureConfig()));
  ipcMain.handle("skillspace:run-events", async (_, runId: string) =>
    getRunEvents(await ensureConfig(), runId)
  );
  ipcMain.handle("skillspace:run-artifacts", async (_, runId: string) =>
    listRunArtifacts(await ensureConfig(), runId)
  );
  ipcMain.handle("skillspace:open-run-folder", async (_, runId: string) =>
    openRunFolder(await ensureConfig(), runId)
  );
  ipcMain.handle("skillspace:delete-run", async (_, runId: string) =>
    deleteRun(await ensureConfig(), runId)
  );
  ipcMain.handle("skillspace:skill-detail", async (_, skillId: string) =>
    getSkillDetail(await ensureConfig(), skillId)
  );
  ipcMain.handle("skillspace:delete-skill", async (_, skillId: string) =>
    deleteSkill(await ensureConfig(), skillId)
  );
  ipcMain.handle("skillspace:summarize-skill", async (_, skillId: string) =>
    summarizeSkill(await ensureConfig(), skillId)
  );
  ipcMain.handle("skillspace:edit-skill-with-llm", async (_, request: EditSkillWithLlmRequest) =>
    editSkillWithLlm(await ensureConfig(), request)
  );
  ipcMain.handle("skillspace:classify-skill-tags", async () =>
    classifySkillTags(await ensureConfig())
  );
  ipcMain.handle("skillspace:prepare-skill-package", async (_, skillId: string) =>
    prepareSkillPackage(await ensureConfig(), skillId)
  );
  ipcMain.handle("skillspace:publish-skill-template", async (_, skillId: string) =>
    publishSkillTemplate(await ensureConfig(), skillId)
  );
  ipcMain.handle("skillspace:marketplace-delete", async (_, templateId: string) =>
    deleteMarketplaceTemplate(await ensureConfig(), templateId)
  );
  ipcMain.handle("skillspace:marketplace-delete-uploaded", async (_, templateId: string) =>
    deleteUploadedMarketplaceTemplate(await ensureConfig(), templateId)
  );
  ipcMain.handle("skillspace:marketplace-share", async (_, templateId: string) =>
    shareMarketplaceTemplate(await ensureConfig(), templateId)
  );
  ipcMain.handle("skillspace:marketplace-templates", async () => listMarketplaceTemplates(await ensureConfig()));
  ipcMain.handle("skillspace:marketplace-refresh", async () => listMarketplaceTemplates(await ensureConfig(), true));
  ipcMain.handle("skillspace:marketplace-install", async (_, request: InstallTemplateRequest) =>
    installMarketplaceTemplate(await ensureConfig(), request)
  );
  ipcMain.handle("skillspace:import", async () => importSkill(await ensureConfig()));
  ipcMain.handle("skillspace:run", async (_, request: RunSkillRequest) =>
    runSkill(await ensureConfig(), request)
  );
  ipcMain.handle("skillspace:continue-run", async (_, request: ContinueRunRequest) =>
    continueRun(await ensureConfig(), request)
  );
  ipcMain.handle("skillspace:schedules", async () => listSchedules(await ensureConfig()));
  ipcMain.handle("skillspace:create-schedule", async (_, request: CreateScheduleRequest) =>
    createSchedule(await ensureConfig(), request)
  );
  ipcMain.handle("skillspace:delete-schedule", async (_, scheduleId: string) =>
    deleteSchedule(await ensureConfig(), scheduleId)
  );
  ipcMain.handle("skillspace:toggle-schedule", async (_, scheduleId: string, enabled: boolean) =>
    toggleSchedule(await ensureConfig(), scheduleId, enabled)
  );
  ipcMain.handle("skillspace:background-scheduler-status", async () =>
    getBackgroundSchedulerStatus(await ensureConfig())
  );
  ipcMain.handle("skillspace:set-background-scheduler", async (_, enabled: boolean) =>
    setBackgroundScheduler(await ensureConfig(), enabled)
  );
  ipcMain.handle("skillspace:feishu-status", async () =>
    getFeishuStatus(await ensureConfig())
  );
  ipcMain.handle("skillspace:feishu-connect", async (_, request: { domain?: "feishu" | "lark" }) =>
    startFeishuConnect(await ensureConfig(), request)
  );
  ipcMain.handle("skillspace:feishu-save", async (_, request: SaveFeishuConfigRequest) =>
    saveFeishuConfig(await ensureConfig(), request)
  );
  ipcMain.handle("skillspace:feishu-enabled", async (_, enabled: boolean) =>
    setFeishuEnabled(await ensureConfig(), enabled)
  );
  ipcMain.handle("skillspace:feishu-test", async (_, message?: string) =>
    sendFeishuTest(await ensureConfig(), message)
  );
  ipcMain.handle("skillspace:feishu-decisions", async () => listFeishuDecisionLogs(await ensureConfig()));
  ipcMain.handle("skillspace:llm-status", async () => getLlmStatus(await ensureConfig()));
  ipcMain.handle("skillspace:llm-save", async (_, request: SaveLlmConfigRequest) =>
    saveLlmConfig(await ensureConfig(), request)
  );
  ipcMain.handle("skillspace:ask-llm", async (_, request: LlmAnalyzeRequest) =>
    askLlm(await ensureConfig(), request)
  );
  ipcMain.handle("skillspace:update-status", () => getUpdateStatus());
  ipcMain.handle("skillspace:update-check", () => checkForUpdates());
  ipcMain.handle("skillspace:update-download", () => downloadUpdate());
  ipcMain.handle("skillspace:update-install", () => installUpdate());
  ipcMain.handle("skillspace:set-close-to-tray", async (_, enabled: boolean) =>
    setCloseToTray(await ensureConfig(), enabled)
  );
  ipcMain.handle("window:minimize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    window?.setSkipTaskbar(false);
    window?.minimize();
  });
  ipcMain.handle("window:toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    if (!window) {
      return;
    }

    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });
  ipcMain.handle("window:close", (event) => {
    (BrowserWindow.fromWebContents(event.sender) ?? mainWindow)?.close();
  });

  createWindow();
  startScheduler();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
