export type Locale = "zh-CN" | "en-US";

export type AgentId = string;

export interface LocaleConfig {
  default: Locale;
  supported: Locale[];
  fallback: Locale;
}

export interface AgentConfig {
  enabled: boolean;
  label: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  reason?: string;
}

export interface SkillSpaceConfig {
  schemaVersion: string;
  dataRoot: string;
  defaultRuntime: AgentId;
  permissionsMode: "full" | "restricted";
  locale: LocaleConfig;
  skillRoots: string[];
  importRoot: string;
  runsRoot: string;
  logsRoot: string;
  artifactsRoot: string;
  registry: {
    type: "sqlite";
    path: string;
  };
  agents: Record<AgentId, AgentConfig>;
  window: {
    closeToTray: boolean;
  };
}

export interface AgentHealth {
  id: AgentId;
  label: string;
  enabled: boolean;
  status: "online" | "offline" | "disabled" | "checking";
  detail: string;
  command?: string;
  checkedAt: string;
}

export interface AgentCandidate {
  id: AgentId;
  label: string;
  command: string;
  args?: string[];
  installed: boolean;
  detail: string;
  alreadyConfigured: boolean;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  version: string;
  defaultRuntime: AgentId;
  runtimes: AgentId[];
  root: string;
  tags: string[];
  hasSkillSpaceMetadata: boolean;
  updatedAt: string;
}

export interface SkillFileEntry {
  path: string;
  kind: "file" | "directory";
  size?: number;
  updatedAt: string;
}

export interface SkillDetail extends SkillSummary {
  skillMarkdown: string;
  workflowText?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  permissions?: unknown;
  adapters?: unknown;
  files: SkillFileEntry[];
}

export interface SkillChange {
  id: string;
  skillId: string;
  skillName: string;
  detectedAt: string;
  before?: {
    version: string;
    updatedAt: string;
    description: string;
  };
  after: {
    version: string;
    updatedAt: string;
    description: string;
  };
}

export interface RunEvent {
  runId: string;
  type: "started" | "stdout" | "stderr" | "assistant" | "tool" | "user" | "error" | "closed";
  message: string;
  timestamp: string;
}

export interface RunSummary {
  runId: string;
  skillId: string;
  skillName: string;
  runtime: AgentId;
  status: "running" | "waiting_input" | "completed" | "failed" | "cancelled" | "unknown";
  startedAt: string;
  endedAt?: string;
  input: string;
  exitCode?: number | null;
  runRoot: string;
  logPath: string;
  sessionId?: string;
  lastMessage?: string;
  diagnostic?: string;
}

export interface RunArtifact {
  path: string;
  name: string;
  kind: "file" | "directory";
  size?: number;
  updatedAt: string;
}

export type ScheduleCadence = "once" | "interval" | "daily" | "weekly" | "monthly";

export interface ScheduledTask {
  id: string;
  name: string;
  skillId: string;
  skillName: string;
  runtime: AgentId;
  input: string;
  cadence: ScheduleCadence;
  timeOfDay?: string;
  intervalMinutes?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  enabled: boolean;
  createdAt: string;
  nextRunAt: string;
  lastRunAt?: string;
  lastRunId?: string;
}

export interface BootstrapPayload {
  config: SkillSpaceConfig;
  agents: AgentHealth[];
  skills: SkillSummary[];
  runs: RunSummary[];
  schedules: ScheduledTask[];
}

export interface RunSkillRequest {
  skillId: string;
  runtime: AgentId;
  input: string;
}

export interface RunSkillResponse {
  runId: string;
}

export interface ContinueRunRequest {
  runId: string;
  input: string;
}

export interface ContinueRunResponse {
  runId: string;
}

export interface ImportSkillResponse {
  imported: boolean;
  skill?: SkillSummary;
  message: string;
}

export interface EditSkillWithLlmRequest {
  skillId: string;
  instruction: string;
}

export interface EditSkillWithLlmResponse {
  skill: SkillDetail;
  summary: string;
}

export interface DeleteRunResponse {
  deleted: boolean;
}

export interface SummarizeSkillResponse {
  skill: SkillSummary;
  summary: string;
}

export interface ClassifySkillTagsResponse {
  skills: SkillSummary[];
}

export interface PublishTemplateVariable {
  key: string;
  label: string;
  kind: "path" | "secret" | "text";
  placeholder: string;
  example?: string;
}

export interface PrepareSkillPackageResponse {
  prepared: boolean;
  skill: SkillSummary;
  packageRoot: string;
  manifestPath: string;
  variables: PublishTemplateVariable[];
  warnings: string[];
  filesProcessed: number;
  filesCopied: number;
}

export interface CreateScheduleRequest {
  name: string;
  skillId: string;
  runtime: AgentId;
  input: string;
  cadence: ScheduleCadence;
  timeOfDay?: string;
  intervalMinutes?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
}

export interface DiscoveredSkill extends SkillSummary {
  sourceRoot: string;
  installed: boolean;
}

export interface SkillTemplateListing {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  downloads: number;
  rating: number;
  runtimes: AgentId[];
  requiredVariables: PublishTemplateVariable[];
  safetyStatus: "ready" | "review_required";
  updatedAt: string;
  source?: "official" | "local" | "remote";
  packageRoot?: string;
  templateMarkdown?: string;
  installed?: boolean;
}

export interface InstallTemplateRequest {
  templateId: string;
  variables: Record<string, string>;
}

export interface InstallTemplateResponse {
  installed: boolean;
  skill?: SkillSummary;
  message: string;
}

export interface PublishTemplateResponse {
  published: boolean;
  template?: SkillTemplateListing;
  packageRoot?: string;
  warnings: string[];
  message: string;
}

export interface DeleteTemplateResponse {
  deleted: boolean;
  message: string;
}

export interface ShareTemplateResponse {
  shared: boolean;
  packageRoot?: string;
  catalogPath?: string;
  message: string;
}

export interface LlmAnalyzeRequest {
  prompt: string;
  skillId?: string;
  runId?: string;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export interface LlmAnalyzeResponse {
  result: string;
}

export type LlmProvider =
  | "claude-code"
  | "openai"
  | "deepseek"
  | "qwen"
  | "kimi"
  | "gemini"
  | "zhipu"
  | "volcengine"
  | "siliconflow"
  | "openrouter"
  | "groq"
  | "lmstudio"
  | "vllm"
  | "ollama"
  | "openai-compatible";

export interface LlmManagerStatus {
  enabled: boolean;
  configured: boolean;
  provider: LlmProvider;
  model: string;
  baseUrl?: string;
  identity: string;
  detail: string;
}

export interface SaveLlmConfigRequest {
  enabled: boolean;
  provider: LlmProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface UpdateStatus {
  currentVersion: string;
  state: "idle" | "checking" | "available" | "not_available" | "downloading" | "downloaded" | "error";
  detail: string;
  availableVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  releaseDate?: string;
  downloaded?: boolean;
  lastCheckedAt?: string;
  error?: string;
}

export interface BackgroundSchedulerStatus {
  supported: boolean;
  enabled: boolean;
  taskName: string;
  detail: string;
  state?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastResult?: string;
  silent?: boolean;
  lastErrorAt?: string;
  lastError?: string;
  recentErrors?: SchedulerErrorEntry[];
}

export interface SchedulerErrorEntry {
  id: string;
  at: string;
  phase: string;
  message: string;
  taskId?: string;
  taskName?: string;
  skillId?: string;
}

export interface SaveAgentConfigRequest {
  agentId: AgentId;
  config: AgentConfig;
}

export interface SaveStorageRootRequest {
  dataRoot: string;
}

export type FeishuReceiveIdType = "open_id" | "chat_id";

export interface FeishuStatus {
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  state: "disabled" | "not_configured" | "connecting" | "connected" | "error";
  detail: string;
  appId?: string;
  receiveId?: string;
  receiveIdType: FeishuReceiveIdType;
  qrDataUrl?: string;
  qrUrl?: string;
  qrExpiresAt?: string;
  lastEventAt?: string;
  lastOutboundAt?: string;
  deliveryStatus?: "idle" | "sending" | "sent" | "received" | "failed";
  deliveryDetail?: string;
  lastError?: string;
  canSend: boolean;
}

export interface SaveFeishuConfigRequest {
  enabled: boolean;
  appId: string;
  appSecret?: string;
  receiveId?: string;
  receiveIdType: FeishuReceiveIdType;
}

export interface StartFeishuConnectRequest {
  domain?: "feishu" | "lark";
}

export interface FeishuDecisionLogEntry {
  id: string;
  at: string;
  action: string;
  reason: string;
  message: string;
  skillId?: string;
  runId?: string;
  confidence?: number;
  replyPreview?: string;
}

export interface SkillSpaceApi {
  bootstrap(): Promise<BootstrapPayload>;
  refreshAgents(): Promise<AgentHealth[]>;
  detectAgentCandidates(): Promise<AgentCandidate[]>;
  saveAgentConfig(request: SaveAgentConfigRequest): Promise<BootstrapPayload>;
  testAgentConfig(request: SaveAgentConfigRequest): Promise<AgentHealth>;
  deleteAgentConfig(agentId: AgentId): Promise<BootstrapPayload>;
  chooseStorageRoot(): Promise<string | null>;
  saveStorageRoot(request: SaveStorageRootRequest): Promise<BootstrapPayload>;
  scanSkills(): Promise<SkillSummary[]>;
  discoverSkills(): Promise<DiscoveredSkill[]>;
  importDiscoveredSkill(root: string): Promise<ImportSkillResponse>;
  listSkillChanges(): Promise<SkillChange[]>;
  listRuns(): Promise<RunSummary[]>;
  getRunEvents(runId: string): Promise<RunEvent[]>;
  listRunArtifacts(runId: string): Promise<RunArtifact[]>;
  openRunFolder(runId: string): Promise<{ opened: boolean; message: string }>;
  deleteRun(runId: string): Promise<DeleteRunResponse>;
  getSkillDetail(skillId: string): Promise<SkillDetail>;
  deleteSkill(skillId: string): Promise<{ deleted: boolean }>;
  summarizeSkill(skillId: string): Promise<SummarizeSkillResponse>;
  editSkillWithLlm(request: EditSkillWithLlmRequest): Promise<EditSkillWithLlmResponse>;
  classifySkillTags(): Promise<ClassifySkillTagsResponse>;
  prepareSkillPackage(skillId: string): Promise<PrepareSkillPackageResponse>;
  publishSkillTemplate(skillId: string): Promise<PublishTemplateResponse>;
  deleteMarketplaceTemplate(templateId: string): Promise<DeleteTemplateResponse>;
  shareMarketplaceTemplate(templateId: string): Promise<ShareTemplateResponse>;
  listMarketplaceTemplates(): Promise<SkillTemplateListing[]>;
  refreshMarketplaceTemplates(): Promise<SkillTemplateListing[]>;
  installMarketplaceTemplate(request: InstallTemplateRequest): Promise<InstallTemplateResponse>;
  importSkill(): Promise<ImportSkillResponse>;
  runSkill(request: RunSkillRequest): Promise<RunSkillResponse>;
  continueRun(request: ContinueRunRequest): Promise<ContinueRunResponse>;
  listSchedules(): Promise<ScheduledTask[]>;
  createSchedule(request: CreateScheduleRequest): Promise<ScheduledTask>;
  deleteSchedule(scheduleId: string): Promise<{ deleted: boolean }>;
  toggleSchedule(scheduleId: string, enabled: boolean): Promise<ScheduledTask>;
  getBackgroundSchedulerStatus(): Promise<BackgroundSchedulerStatus>;
  setBackgroundScheduler(enabled: boolean): Promise<BackgroundSchedulerStatus>;
  getFeishuStatus(): Promise<FeishuStatus>;
  startFeishuConnect(request?: StartFeishuConnectRequest): Promise<FeishuStatus>;
  saveFeishuConfig(request: SaveFeishuConfigRequest): Promise<FeishuStatus>;
  setFeishuEnabled(enabled: boolean): Promise<FeishuStatus>;
  sendFeishuTest(message?: string): Promise<FeishuStatus>;
  listFeishuDecisionLogs(): Promise<FeishuDecisionLogEntry[]>;
  getLlmStatus(): Promise<LlmManagerStatus>;
  saveLlmConfig(request: SaveLlmConfigRequest): Promise<LlmManagerStatus>;
  askLlm(request: LlmAnalyzeRequest): Promise<LlmAnalyzeResponse>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<UpdateStatus>;
  installUpdate(): Promise<void>;
  setCloseToTray(enabled: boolean): Promise<SkillSpaceConfig>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  onRunEvent(callback: (event: RunEvent) => void): () => void;
}
