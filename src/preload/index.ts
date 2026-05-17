import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentHealth,
  BackgroundSchedulerStatus,
  BootstrapPayload,
  ClassifySkillTagsResponse,
  ContinueRunRequest,
  ContinueRunResponse,
  CreateScheduleRequest,
  DiscoveredSkill,
  ImportSkillResponse,
  LlmAnalyzeRequest,
  LlmAnalyzeResponse,
  RunEvent,
  RunArtifact,
  RunSkillRequest,
  RunSkillResponse,
  RunSummary,
  ScheduledTask,
  SkillChange,
  SkillDetail,
  SkillSpaceApi,
  SkillSummary
} from "../shared/types";

const api: SkillSpaceApi = {
  bootstrap: () => ipcRenderer.invoke("skillspace:bootstrap") as Promise<BootstrapPayload>,
  refreshAgents: () => ipcRenderer.invoke("skillspace:agents") as Promise<AgentHealth[]>,
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
  classifySkillTags: () =>
    ipcRenderer.invoke("skillspace:classify-skill-tags") as Promise<ClassifySkillTagsResponse>,
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
  askLlm: (request: LlmAnalyzeRequest) =>
    ipcRenderer.invoke("skillspace:ask-llm", request) as Promise<LlmAnalyzeResponse>,
  minimizeWindow: () => ipcRenderer.invoke("window:minimize") as Promise<void>,
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize") as Promise<void>,
  closeWindow: () => ipcRenderer.invoke("window:close") as Promise<void>,
  onRunEvent: (callback: (event: RunEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: RunEvent): void => callback(event);
    ipcRenderer.on("skillspace:run-event", listener);
    return () => ipcRenderer.removeListener("skillspace:run-event", listener);
  }
};

contextBridge.exposeInMainWorld("skillSpace", api);
