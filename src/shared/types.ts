export type Locale = "zh-CN" | "en-US";

export type AgentId = "claude" | "codex" | "openclaw" | "hermes";

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

export interface LlmAnalyzeRequest {
  prompt: string;
  skillId?: string;
  runId?: string;
}

export interface LlmAnalyzeResponse {
  result: string;
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
}

export interface SkillSpaceApi {
  bootstrap(): Promise<BootstrapPayload>;
  refreshAgents(): Promise<AgentHealth[]>;
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
  classifySkillTags(): Promise<ClassifySkillTagsResponse>;
  importSkill(): Promise<ImportSkillResponse>;
  runSkill(request: RunSkillRequest): Promise<RunSkillResponse>;
  continueRun(request: ContinueRunRequest): Promise<ContinueRunResponse>;
  listSchedules(): Promise<ScheduledTask[]>;
  createSchedule(request: CreateScheduleRequest): Promise<ScheduledTask>;
  deleteSchedule(scheduleId: string): Promise<{ deleted: boolean }>;
  toggleSchedule(scheduleId: string, enabled: boolean): Promise<ScheduledTask>;
  getBackgroundSchedulerStatus(): Promise<BackgroundSchedulerStatus>;
  setBackgroundScheduler(enabled: boolean): Promise<BackgroundSchedulerStatus>;
  askLlm(request: LlmAnalyzeRequest): Promise<LlmAnalyzeResponse>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  onRunEvent(callback: (event: RunEvent) => void): () => void;
}
