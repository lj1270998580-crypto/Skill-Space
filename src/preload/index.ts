import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentHealth,
  AgentCandidate,
  BackgroundSchedulerStatus,
  BootstrapPayload,
  ClassifySkillTagsResponse,
  ContinueRunRequest,
  ContinueRunResponse,
  CreateScheduleRequest,
  DiscoveredSkill,
  ImportSkillResponse,
  EditSkillWithLlmRequest,
  EditSkillWithLlmResponse,
  LlmAnalyzeRequest,
  LlmAnalyzeResponse,
  SaveLlmConfigRequest,
  InstallTemplateRequest,
  InstallTemplateResponse,
  PrepareSkillPackageResponse,
  PublishTemplateResponse,
  DeleteTemplateResponse,
  ShareTemplateResponse,
  SkillTemplateListing,
  RunEvent,
  RunArtifact,
  SaveFeishuConfigRequest,
  RunSkillRequest,
  RunSkillResponse,
  RunSummary,
  ScheduledTask,
  SaveAgentConfigRequest,
  SaveStorageRootRequest,
  SkillChange,
  SkillDetail,
  SkillSpaceApi,
  SkillSummary,
  UpdateStatus
} from "../shared/types";

const api: SkillSpaceApi = {
  bootstrap: () => ipcRenderer.invoke("skillspace:bootstrap") as Promise<BootstrapPayload>,
  refreshAgents: () => ipcRenderer.invoke("skillspace:agents") as Promise<AgentHealth[]>,
  detectAgentCandidates: () => ipcRenderer.invoke("skillspace:agent-candidates") as Promise<AgentCandidate[]>,
  saveAgentConfig: (request: SaveAgentConfigRequest) =>
    ipcRenderer.invoke("skillspace:agent-save", request) as Promise<BootstrapPayload>,
  testAgentConfig: (request: SaveAgentConfigRequest) =>
    ipcRenderer.invoke("skillspace:agent-test", request) as Promise<AgentHealth>,
  deleteAgentConfig: (agentId) => ipcRenderer.invoke("skillspace:agent-delete", agentId) as Promise<BootstrapPayload>,
  chooseStorageRoot: () => ipcRenderer.invoke("skillspace:storage-choose") as Promise<string | null>,
  saveStorageRoot: (request: SaveStorageRootRequest) =>
    ipcRenderer.invoke("skillspace:storage-save", request) as Promise<BootstrapPayload>,
  scanSkills: () => ipcRenderer.invoke("skillspace:skills") as Promise<SkillSummary[]>,
  discoverSkills: () => ipcRenderer.invoke("skillspace:discover-skills") as Promise<DiscoveredSkill[]>,
  importDiscoveredSkill: (root: string) =>
    ipcRenderer.invoke("skillspace:import-discovered-skill", root) as Promise<ImportSkillResponse>,
  listSkillChanges: () => ipcRenderer.invoke("skillspace:skill-changes") as Promise<SkillChange[]>,
  listRuns: () => ipcRenderer.invoke("skillspace:runs") as Promise<RunSummary[]>,
  getRunEvents: (runId: string) => ipcRenderer.invoke("skillspace:run-events", runId) as Promise<RunEvent[]>,
  listRunArtifacts: (runId: string) =>
    ipcRenderer.invoke("skillspace:run-artifacts", runId) as Promise<RunArtifact[]>,
  openRunFolder: (runId: string) =>
    ipcRenderer.invoke("skillspace:open-run-folder", runId) as Promise<{ opened: boolean; message: string }>,
  deleteRun: (runId: string) => ipcRenderer.invoke("skillspace:delete-run", runId) as Promise<{ deleted: boolean }>,
  getSkillDetail: (skillId: string) =>
    ipcRenderer.invoke("skillspace:skill-detail", skillId) as Promise<SkillDetail>,
  deleteSkill: (skillId: string) =>
    ipcRenderer.invoke("skillspace:delete-skill", skillId) as Promise<{ deleted: boolean }>,
  summarizeSkill: (skillId: string) =>
    ipcRenderer.invoke("skillspace:summarize-skill", skillId) as Promise<{ skill: SkillSummary; summary: string }>,
  editSkillWithLlm: (request: EditSkillWithLlmRequest) =>
    ipcRenderer.invoke("skillspace:edit-skill-with-llm", request) as Promise<EditSkillWithLlmResponse>,
  classifySkillTags: () =>
    ipcRenderer.invoke("skillspace:classify-skill-tags") as Promise<ClassifySkillTagsResponse>,
  prepareSkillPackage: (skillId: string) =>
    ipcRenderer.invoke("skillspace:prepare-skill-package", skillId) as Promise<PrepareSkillPackageResponse>,
  publishSkillTemplate: (skillId: string) =>
    ipcRenderer.invoke("skillspace:publish-skill-template", skillId) as Promise<PublishTemplateResponse>,
  deleteMarketplaceTemplate: (templateId: string) =>
    ipcRenderer.invoke("skillspace:marketplace-delete", templateId) as Promise<DeleteTemplateResponse>,
  deleteUploadedMarketplaceTemplate: (templateId: string) =>
    ipcRenderer.invoke("skillspace:marketplace-delete-uploaded", templateId) as Promise<DeleteTemplateResponse>,
  shareMarketplaceTemplate: (templateId: string) =>
    ipcRenderer.invoke("skillspace:marketplace-share", templateId) as Promise<ShareTemplateResponse>,
  listMarketplaceTemplates: () =>
    ipcRenderer.invoke("skillspace:marketplace-templates") as Promise<SkillTemplateListing[]>,
  refreshMarketplaceTemplates: () =>
    ipcRenderer.invoke("skillspace:marketplace-refresh") as Promise<SkillTemplateListing[]>,
  installMarketplaceTemplate: (request: InstallTemplateRequest) =>
    ipcRenderer.invoke("skillspace:marketplace-install", request) as Promise<InstallTemplateResponse>,
  importSkill: () => ipcRenderer.invoke("skillspace:import") as Promise<ImportSkillResponse>,
  runSkill: (request: RunSkillRequest) =>
    ipcRenderer.invoke("skillspace:run", request) as Promise<RunSkillResponse>,
  continueRun: (request: ContinueRunRequest) =>
    ipcRenderer.invoke("skillspace:continue-run", request) as Promise<ContinueRunResponse>,
  listSchedules: () => ipcRenderer.invoke("skillspace:schedules") as Promise<ScheduledTask[]>,
  createSchedule: (request: CreateScheduleRequest) =>
    ipcRenderer.invoke("skillspace:create-schedule", request) as Promise<ScheduledTask>,
  deleteSchedule: (scheduleId: string) =>
    ipcRenderer.invoke("skillspace:delete-schedule", scheduleId) as Promise<{ deleted: boolean }>,
  toggleSchedule: (scheduleId: string, enabled: boolean) =>
    ipcRenderer.invoke("skillspace:toggle-schedule", scheduleId, enabled) as Promise<ScheduledTask>,
  getBackgroundSchedulerStatus: () =>
    ipcRenderer.invoke("skillspace:background-scheduler-status") as Promise<BackgroundSchedulerStatus>,
  setBackgroundScheduler: (enabled: boolean) =>
    ipcRenderer.invoke("skillspace:set-background-scheduler", enabled) as Promise<BackgroundSchedulerStatus>,
  clearBackgroundSchedulerErrors: () =>
    ipcRenderer.invoke("skillspace:clear-background-scheduler-errors") as Promise<BackgroundSchedulerStatus>,
  getFeishuStatus: () => ipcRenderer.invoke("skillspace:feishu-status"),
  startFeishuConnect: (request = {}) => ipcRenderer.invoke("skillspace:feishu-connect", request),
  saveFeishuConfig: (request: SaveFeishuConfigRequest) =>
    ipcRenderer.invoke("skillspace:feishu-save", request),
  setFeishuEnabled: (enabled: boolean) => ipcRenderer.invoke("skillspace:feishu-enabled", enabled),
  sendFeishuTest: (message?: string) => ipcRenderer.invoke("skillspace:feishu-test", message),
  listFeishuDecisionLogs: () => ipcRenderer.invoke("skillspace:feishu-decisions"),
  getLlmStatus: () => ipcRenderer.invoke("skillspace:llm-status"),
  saveLlmConfig: (request: SaveLlmConfigRequest) => ipcRenderer.invoke("skillspace:llm-save", request),
  askLlm: (request: LlmAnalyzeRequest) =>
    ipcRenderer.invoke("skillspace:ask-llm", request) as Promise<LlmAnalyzeResponse>,
  getUpdateStatus: () => ipcRenderer.invoke("skillspace:update-status"),
  checkForUpdates: () => ipcRenderer.invoke("skillspace:update-check"),
  downloadUpdate: () => ipcRenderer.invoke("skillspace:update-download"),
  installUpdate: () => ipcRenderer.invoke("skillspace:update-install"),
  setCloseToTray: (enabled: boolean) => ipcRenderer.invoke("skillspace:set-close-to-tray", enabled),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize") as Promise<void>,
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize") as Promise<void>,
  closeWindow: () => ipcRenderer.invoke("window:close") as Promise<void>,
  onRunEvent: (callback: (event: RunEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: RunEvent): void => callback(event);
    ipcRenderer.on("skillspace:run-event", listener);
    return () => ipcRenderer.removeListener("skillspace:run-event", listener);
  },
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_: Electron.IpcRendererEvent, status: UpdateStatus): void => callback(status);
    ipcRenderer.on("skillspace:update-status-changed", listener);
    return () => ipcRenderer.removeListener("skillspace:update-status-changed", listener);
  }
};

contextBridge.exposeInMainWorld("skillSpace", api);
