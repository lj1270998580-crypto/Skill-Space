import {
  AlarmClock,
  Boxes,
  Bot,
  Cable,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleOff,
  Clock3,
  Command,
  Database,
  DownloadCloud,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  FolderInput,
  Gauge,
  GitCompare,
  Globe2,
  History,
  LayoutDashboard,
  Loader2,
  Maximize2,
  MessageCircle,
  Minus,
  Moon,
  Play,
  QrCode,
  RefreshCw,
  Search,
  ScrollText,
  Send,
  Settings,
  Sparkles,
  Star,
  Sun,
  Tags,
  TerminalSquare,
  Trash2,
  Wand2,
  Workflow,
  X,
  XCircle
} from "lucide-react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import type {
  AgentHealth,
  AgentId,
  BackgroundSchedulerStatus,
  BootstrapPayload,
  DiscoveredSkill,
  FeishuReceiveIdType,
  FeishuStatus,
  Locale,
  LlmManagerStatus,
  LlmProvider,
  RunArtifact,
  RunEvent,
  RunSummary,
  ScheduleCadence,
  ScheduledTask,
  SkillChange,
  SkillDetail,
  SkillSummary,
  UpdateStatus
} from "../../shared/types";
import { createTranslator } from "./i18n";

type ViewId = "dashboard" | "skills" | "runs" | "automations" | "agents" | "feishu" | "settings";
type ThemeMode = "light" | "dark";
type StewardChatMessage = {
  role: "user" | "assistant";
  content: string;
  at: string;
};

const navItems: Array<{ id: ViewId; labelKey: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { id: "skills", labelKey: "nav.skills", icon: Boxes },
  { id: "runs", labelKey: "nav.runs", icon: TerminalSquare },
  { id: "automations", labelKey: "nav.automations", icon: AlarmClock },
  { id: "agents", labelKey: "nav.agents", icon: Bot },
  { id: "feishu", labelKey: "nav.feishu", icon: MessageCircle },
  { id: "settings", labelKey: "nav.settings", icon: Settings }
];

const llmProviderOptions: Array<{ id: LlmProvider; labelKey: string; model: string; baseUrl?: string }> = [
  { id: "claude-code", labelKey: "llm.provider.claude", model: "skill-space-steward" },
  { id: "openai", labelKey: "llm.provider.openai", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
  { id: "deepseek", labelKey: "llm.provider.deepseek", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1" },
  { id: "qwen", labelKey: "llm.provider.qwen", model: "qwen-plus", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "kimi", labelKey: "llm.provider.kimi", model: "moonshot-v1-8k", baseUrl: "https://api.moonshot.cn/v1" },
  { id: "gemini", labelKey: "llm.provider.gemini", model: "gemini-2.5-flash", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { id: "zhipu", labelKey: "llm.provider.zhipu", model: "glm-4-flash", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { id: "volcengine", labelKey: "llm.provider.volcengine", model: "doubao-seed-1-6", baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
  { id: "siliconflow", labelKey: "llm.provider.siliconflow", model: "Qwen/Qwen2.5-7B-Instruct", baseUrl: "https://api.siliconflow.cn/v1" },
  { id: "openrouter", labelKey: "llm.provider.openrouter", model: "openai/gpt-4o-mini", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "groq", labelKey: "llm.provider.groq", model: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "ollama", labelKey: "llm.provider.ollama", model: "llama3.1", baseUrl: "http://127.0.0.1:11434" },
  { id: "lmstudio", labelKey: "llm.provider.lmstudio", model: "local-model", baseUrl: "http://127.0.0.1:1234/v1" },
  { id: "vllm", labelKey: "llm.provider.vllm", model: "local-model", baseUrl: "http://127.0.0.1:8000/v1" },
  { id: "openai-compatible", labelKey: "llm.provider.compatible", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" }
];

const statusIcon = {
  online: CheckCircle2,
  offline: XCircle,
  disabled: CircleOff,
  checking: Loader2
};

function readStoredStewardMessages(): StewardChatMessage[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("skillspace.stewardMessages") ?? "[]") as StewardChatMessage[];
    return parsed
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role,
        content: String(message.content ?? ""),
        at: message.at || new Date().toISOString()
      }))
      .filter((message) => message.content.trim())
      .slice(-16);
  } catch {
    return [];
  }
}

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function App(): ReactElement {
  const [payload, setPayload] = useState<BootstrapPayload | null>(null);
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [locale, setLocale] = useState<Locale>(() =>
    window.localStorage.getItem("skillspace.locale") === "en-US" ? "en-US" : "zh-CN"
  );
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedSkillDetail, setSelectedSkillDetail] = useState<SkillDetail | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentId>("claude");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runInput, setRunInput] = useState("");
  const [followUpInput, setFollowUpInput] = useState("");
  const [runEvents, setRunEvents] = useState<RunEvent[]>([]);
  const [runHistory, setRunHistory] = useState<RunSummary[]>([]);
  const [runArtifacts, setRunArtifacts] = useState<RunArtifact[]>([]);
  const [skillChanges, setSkillChanges] = useState<SkillChange[]>([]);
  const [backgroundScheduler, setBackgroundScheduler] = useState<BackgroundSchedulerStatus | null>(null);
  const [feishuStatus, setFeishuStatus] = useState<FeishuStatus | null>(null);
  const [llmStatus, setLlmStatus] = useState<LlmManagerStatus | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [schedules, setSchedules] = useState<ScheduledTask[]>([]);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleInput, setScheduleInput] = useState("");
  const [scheduleCadence, setScheduleCadence] = useState<ScheduleCadence>("daily");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleInterval, setScheduleInterval] = useState(60);
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(1);
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1);
  const [discoveredSkills, setDiscoveredSkills] = useState<DiscoveredSkill[]>([]);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isClassifyingTags, setIsClassifyingTags] = useState(false);
  const [llmPrompt, setLlmPrompt] = useState("");
  const [llmResult, setLlmResult] = useState("");
  const [stewardMessages, setStewardMessages] = useState<StewardChatMessage[]>(readStoredStewardMessages);
  const [isLlmBusy, setIsLlmBusy] = useState(false);
  const [isTestingLlm, setIsTestingLlm] = useState(false);
  const [llmConfigMessage, setLlmConfigMessage] = useState("");
  const [updateMessage, setUpdateMessage] = useState("");
  const [useParameterForm, setUseParameterForm] = useState(() => window.localStorage.getItem("skillspace.parameterForm") === "true");
  const [favoriteSkillIds, setFavoriteSkillIds] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("skillspace.favoriteSkillIds") ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const [skillQuery, setSkillQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [skillAliases, setSkillAliases] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("skillspace.skillAliases") ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const requested = new URLSearchParams(window.location.search).get("theme");
    if (requested === "dark" || requested === "light") {
      return requested;
    }

    const stored = window.localStorage.getItem("skillspace.theme");
    return stored === "dark" ? "dark" : "light";
  });

  const t = useMemo(() => createTranslator(locale), [locale]);

  const selectedSkill = useMemo(() => {
    if (!payload?.skills.length) {
      return null;
    }

    return payload.skills.find((skill) => skill.id === selectedSkillId) ?? payload.skills[0];
  }, [payload?.skills, selectedSkillId]);

  const availableAgents = useMemo(
    () => payload?.agents.filter((agent) => agent.enabled && agent.status === "online") ?? [],
    [payload?.agents]
  );

  const selectedRun = useMemo(() => {
    if (runHistory.length === 0) {
      return null;
    }

    return runHistory.find((run) => run.runId === selectedRunId) ?? runHistory[0];
  }, [runHistory, selectedRunId]);

  const allSkillTags = useMemo(() => {
    const tags = new Set<string>();
    payload?.skills.forEach((skill) => skill.tags.forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [payload?.skills]);

  const filteredSkills = useMemo(() => {
    const query = skillQuery.trim().toLowerCase();
    return (payload?.skills ?? []).filter((skill) => {
      const matchesQuery =
        !query ||
        [skillAliases[skill.id], skill.name, skill.id, skill.description, skill.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesTag = selectedTag === "all" || skill.tags.includes(selectedTag);
      const matchesFavorite = !favoritesOnly || favoriteSkillIds.includes(skill.id);
      return matchesQuery && matchesTag && matchesFavorite;
    });
  }, [payload?.skills, skillQuery, selectedTag, favoritesOnly, favoriteSkillIds, skillAliases]);

  async function load(): Promise<void> {
    setIsRefreshing(true);
    const next = await window.skillSpace.bootstrap();
    const [changes, schedulerStatus, nextLlmStatus, nextUpdateStatus] = await Promise.all([
      window.skillSpace.listSkillChanges(),
      window.skillSpace.getBackgroundSchedulerStatus(),
      window.skillSpace.getLlmStatus(),
      window.skillSpace.getUpdateStatus()
    ]);
    const nextFeishuStatus = await window.skillSpace.getFeishuStatus();
    const storedLocale = window.localStorage.getItem("skillspace.locale") as Locale | null;
    setPayload(next);
    setRunHistory(next.runs);
    setSchedules(next.schedules);
    setSkillChanges(changes);
    setBackgroundScheduler(schedulerStatus);
    setFeishuStatus(nextFeishuStatus);
    setLlmStatus(nextLlmStatus);
    setUpdateStatus(nextUpdateStatus);
    setSelectedRunId((current) => current ?? next.runs[0]?.runId ?? null);
    setLocale(
      storedLocale && next.config.locale.supported.includes(storedLocale)
        ? storedLocale
        : next.config.locale.default
    );
    setSelectedAgent(next.config.defaultRuntime);
    setSelectedSkillId((current) => current ?? next.skills[0]?.id ?? null);
    setIsRefreshing(false);
  }

  function changeLocale(nextLocale: Locale): void {
    window.localStorage.setItem("skillspace.locale", nextLocale);
    setLocale(nextLocale);
  }

  async function refresh(): Promise<void> {
    setIsRefreshing(true);
    const [agents, skills, runs, nextSchedules] = await Promise.all([
      window.skillSpace.refreshAgents(),
      window.skillSpace.scanSkills(),
      window.skillSpace.listRuns(),
      window.skillSpace.listSchedules()
    ]);
    const [changes, schedulerStatus, nextLlmStatus, nextUpdateStatus] = await Promise.all([
      window.skillSpace.listSkillChanges(),
      window.skillSpace.getBackgroundSchedulerStatus(),
      window.skillSpace.getLlmStatus(),
      window.skillSpace.getUpdateStatus()
    ]);
    const nextFeishuStatus = await window.skillSpace.getFeishuStatus();
    setPayload((current) => (current ? { ...current, agents, skills, runs, schedules: nextSchedules } : current));
    setRunHistory(runs);
    setSchedules(nextSchedules);
    setSkillChanges(changes);
    setBackgroundScheduler(schedulerStatus);
    setFeishuStatus(nextFeishuStatus);
    setLlmStatus(nextLlmStatus);
    setUpdateStatus(nextUpdateStatus);
    setSelectedRunId((current) => current ?? runs[0]?.runId ?? null);
    setSelectedSkillId((current) => current ?? skills[0]?.id ?? null);
    if (selectedSkillId) {
      await window.skillSpace.getSkillDetail(selectedSkillId).then(setSelectedSkillDetail).catch(() => undefined);
    }
    setIsRefreshing(false);
  }

  async function importSkill(): Promise<void> {
    const response = await window.skillSpace.importSkill();
    if (!response.imported) {
      return;
    }

    const skills = await window.skillSpace.scanSkills();
    const runs = await window.skillSpace.listRuns();
    setPayload((current) => (current ? { ...current, skills, runs } : current));
    setRunHistory(runs);
    setSelectedSkillId(response.skill?.id ?? skills[0]?.id ?? null);
    setActiveView("skills");
  }

  async function runSelectedSkill(): Promise<void> {
    if (!selectedSkill) {
      return;
    }

    setIsRunning(true);
    try {
      const response = await window.skillSpace.runSkill({
        skillId: selectedSkill.id,
        runtime: selectedAgent,
        input: runInput
      });
      setSelectedRunId(response.runId);
      setRunEvents((events) => [
        ...events,
        {
          runId: response.runId,
          type: "started",
          message: t("run.started"),
          timestamp: new Date().toISOString()
        }
      ]);
      setActiveView("runs");
    } catch (error) {
      setIsRunning(false);
      setRunEvents((events) => [
        ...events,
        {
          runId: "local",
          type: "error",
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        }
      ]);
    }
  }

  async function continueSelectedRun(): Promise<void> {
    if (!selectedRun || !followUpInput.trim()) {
      return;
    }

    const input = followUpInput.trim();
    setIsRunning(true);
    setFollowUpInput("");
    try {
      await window.skillSpace.continueRun({
        runId: selectedRun.runId,
        input
      });
      setRunEvents((events) => [
        ...events,
        {
          runId: selectedRun.runId,
          type: "user",
          message: input,
          timestamp: new Date().toISOString()
        }
      ]);
      setActiveView("runs");
    } catch (error) {
      setIsRunning(false);
      setFollowUpInput(input);
      setRunEvents((events) => [
        ...events,
        {
          runId: selectedRun.runId,
          type: "error",
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        }
      ]);
    }
  }

  async function deleteSelectedRun(): Promise<void> {
    if (!selectedRun) {
      return;
    }

    await window.skillSpace.deleteRun(selectedRun.runId);
    const runs = await window.skillSpace.listRuns();
    setRunHistory(runs);
    setSelectedRunId(runs[0]?.runId ?? null);
    setRunEvents([]);
    setPayload((current) => (current ? { ...current, runs } : current));
  }

  async function deleteRun(run: RunSummary): Promise<void> {
    await window.skillSpace.deleteRun(run.runId);
    const runs = await window.skillSpace.listRuns();
    setRunHistory(runs);
    setSelectedRunId((current) => (current === run.runId ? runs[0]?.runId ?? null : current));
    if (selectedRunId === run.runId) {
      setRunEvents([]);
    }
    setPayload((current) => (current ? { ...current, runs } : current));
  }

  async function summarizeSelectedSkill(): Promise<void> {
    if (!selectedSkill) {
      return;
    }

    setIsSummarizing(true);
    try {
      const response = await window.skillSpace.summarizeSkill(selectedSkill.id);
      const skills = await window.skillSpace.scanSkills();
      setPayload((current) => (current ? { ...current, skills } : current));
      setSelectedSkillDetail((detail) => (detail ? { ...detail, description: response.summary } : detail));
    } finally {
      setIsSummarizing(false);
    }
  }

  async function deleteSelectedSkill(): Promise<void> {
    if (!selectedSkill) {
      return;
    }

    await window.skillSpace.deleteSkill(selectedSkill.id);
    const skills = await window.skillSpace.scanSkills();
    const runs = await window.skillSpace.listRuns();
    const nextSkill = skills[0] ?? null;
    setPayload((current) => (current ? { ...current, skills, runs } : current));
    setRunHistory(runs);
    setSelectedSkillId(nextSkill?.id ?? null);
    setSelectedSkillDetail(null);
  }

  async function discoverExistingSkills(): Promise<void> {
    setIsDiscovering(true);
    try {
      setDiscoveredSkills(await window.skillSpace.discoverSkills());
      setIsDiscoveryOpen(true);
    } finally {
      setIsDiscovering(false);
    }
  }

  async function importExistingSkill(root: string): Promise<void> {
    const response = await window.skillSpace.importDiscoveredSkill(root);
    if (!response.imported) {
      return;
    }
    const skills = await window.skillSpace.scanSkills();
    setPayload((current) => (current ? { ...current, skills } : current));
    setSelectedSkillId(response.skill?.id ?? skills[0]?.id ?? null);
    setDiscoveredSkills(await window.skillSpace.discoverSkills());
    setIsDiscoveryOpen(false);
  }

  async function createAutomation(): Promise<void> {
    if (!selectedSkill) {
      return;
    }

    const task = await window.skillSpace.createSchedule({
      name: scheduleName || selectedSkill.name,
      skillId: selectedSkill.id,
      runtime: selectedAgent,
      input: scheduleInput,
      cadence: scheduleCadence,
      timeOfDay: scheduleTime,
      intervalMinutes: scheduleInterval,
      dayOfWeek: scheduleDayOfWeek,
      dayOfMonth: scheduleDayOfMonth
    });
    setSchedules((current) => [...current, task].sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt)));
    setScheduleName("");
    setScheduleInput("");
    setActiveView("automations");
  }

  async function deleteAutomation(scheduleId: string): Promise<void> {
    await window.skillSpace.deleteSchedule(scheduleId);
    setSchedules(await window.skillSpace.listSchedules());
  }

  async function toggleAutomation(task: ScheduledTask): Promise<void> {
    const updated = await window.skillSpace.toggleSchedule(task.id, !task.enabled);
    setSchedules((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function askLlm(): Promise<void> {
    const prompt = llmPrompt.trim();
    if (!prompt) {
      return;
    }

    setIsLlmBusy(true);
    setLlmResult("");
    const userMessage: StewardChatMessage = { role: "user", content: prompt, at: new Date().toISOString() };
    const nextMessages = [...stewardMessages, userMessage].slice(-16);
    setStewardMessages(nextMessages);
    window.localStorage.setItem("skillspace.stewardMessages", JSON.stringify(nextMessages));
    setLlmPrompt("");
    try {
      const response = await window.skillSpace.askLlm({
        prompt,
        skillId: selectedSkill?.id,
        runId: selectedRun?.runId,
        history: stewardMessages.slice(-10).map((message) => ({
          role: message.role,
          content: message.content
        }))
      });
      setLlmResult(response.result);
      const assistantMessage: StewardChatMessage = {
        role: "assistant",
        content: response.result,
        at: new Date().toISOString()
      };
      setStewardMessages((current) => {
        const stored = [...current, assistantMessage].slice(-16);
        window.localStorage.setItem("skillspace.stewardMessages", JSON.stringify(stored));
        return stored;
      });
    } catch (error) {
      const assistantMessage: StewardChatMessage = {
        role: "assistant",
        content: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString()
      };
      setStewardMessages((current) => {
        const stored = [...current, assistantMessage].slice(-16);
        window.localStorage.setItem("skillspace.stewardMessages", JSON.stringify(stored));
        return stored;
      });
    } finally {
      setIsLlmBusy(false);
    }
  }

  function clearStewardChat(): void {
    setStewardMessages([]);
    setLlmResult("");
    setLlmPrompt("");
    window.localStorage.removeItem("skillspace.stewardMessages");
  }

  function toggleTheme(): void {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem("skillspace.theme", next);
      return next;
    });
  }

  function toggleParameterForm(enabled: boolean): void {
    window.localStorage.setItem("skillspace.parameterForm", String(enabled));
    setUseParameterForm(enabled);
  }

  function toggleFavoriteSkill(skillId: string): void {
    setFavoriteSkillIds((current) => {
      const next = current.includes(skillId) ? current.filter((id) => id !== skillId) : [...current, skillId];
      window.localStorage.setItem("skillspace.favoriteSkillIds", JSON.stringify(next));
      return next;
    });
  }

  function displaySkillName(skill: SkillSummary | null | undefined): string {
    if (!skill) {
      return "";
    }

    return skillAliases[skill.id]?.trim() || skill.name;
  }

  function displayRunSkillName(run: RunSummary): string {
    return skillAliases[run.skillId]?.trim() || run.skillName;
  }

  function updateSkillAlias(skillId: string, alias: string): void {
    setSkillAliases((current) => {
      const next = { ...current };
      const trimmed = alias.trim();
      if (trimmed) {
        next[skillId] = trimmed;
      } else {
        delete next[skillId];
      }
      window.localStorage.setItem("skillspace.skillAliases", JSON.stringify(next));
      return next;
    });
  }

  async function classifySkillTags(): Promise<void> {
    setIsClassifyingTags(true);
    try {
      const response = await window.skillSpace.classifySkillTags();
      setPayload((current) => (current ? { ...current, skills: response.skills } : current));
      setSelectedTag("all");
    } finally {
      setIsClassifyingTags(false);
    }
  }

  async function toggleBackgroundScheduler(enabled: boolean): Promise<void> {
    setBackgroundScheduler(await window.skillSpace.setBackgroundScheduler(enabled));
  }

  async function startFeishuConnect(): Promise<void> {
    setFeishuStatus(await window.skillSpace.startFeishuConnect({ domain: "feishu" }));
  }

  async function saveFeishuConfig(request: {
    enabled: boolean;
    appId: string;
    appSecret?: string;
    receiveId?: string;
    receiveIdType: FeishuReceiveIdType;
  }): Promise<void> {
    setFeishuStatus(await window.skillSpace.saveFeishuConfig(request));
  }

  async function setFeishuEnabled(enabled: boolean): Promise<void> {
    setFeishuStatus(await window.skillSpace.setFeishuEnabled(enabled));
  }

  async function sendFeishuTest(): Promise<void> {
    setFeishuStatus(await window.skillSpace.sendFeishuTest());
  }

  async function saveLlmConfig(request: {
    enabled: boolean;
    provider: LlmProvider;
    model: string;
    baseUrl?: string;
    apiKey?: string;
  }): Promise<void> {
    setLlmConfigMessage("");
    try {
      const nextStatus = await window.skillSpace.saveLlmConfig(request);
      setLlmStatus(nextStatus);
      setLlmConfigMessage(nextStatus.configured ? t("llm.saved") : nextStatus.detail);
    } catch (error) {
      setLlmConfigMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function testLlmConnection(): Promise<void> {
    setIsTestingLlm(true);
    setLlmConfigMessage(t("llm.testing"));
    try {
      const response = await window.skillSpace.askLlm({
        prompt: "请只用一句中文回复：Skill-Space 管家连接测试成功。"
      });
      setLlmConfigMessage(response.result || t("llm.testPassed"));
    } catch (error) {
      setLlmConfigMessage(`${t("llm.testFailed")}：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsTestingLlm(false);
    }
  }

  async function checkUpdate(): Promise<void> {
    const checking: UpdateStatus = {
      currentVersion: updateStatus?.currentVersion ?? "0.0.0",
      state: "checking",
      detail: t("update.checking"),
      lastCheckedAt: new Date().toISOString()
    };
    setUpdateStatus(checking);
    setUpdateMessage(checking.detail);
    try {
      const status = await window.skillSpace.checkForUpdates();
      setUpdateStatus(status);
      setUpdateMessage(status.detail);
      if (status.state === "available") {
        setIsUpdateDialogOpen(true);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setUpdateStatus((current) => ({
        currentVersion: current?.currentVersion ?? "0.0.0",
        state: "error",
        detail,
        error: detail,
        lastCheckedAt: new Date().toISOString()
      }));
      setUpdateMessage(detail);
    }
  }

  async function downloadUpdate(): Promise<void> {
    setUpdateMessage(t("update.downloading"));
    const status = await window.skillSpace.downloadUpdate();
    setUpdateStatus(status);
    setUpdateMessage(status.detail);
  }

  async function installUpdate(): Promise<void> {
    await window.skillSpace.installUpdate();
  }

  async function openSelectedRunFolder(): Promise<void> {
    if (!selectedRun) {
      return;
    }

    await window.skillSpace.openRunFolder(selectedRun.runId);
  }

  useEffect(() => {
    void load();
    return window.skillSpace.onRunEvent((event) => {
      setSelectedRunId(event.runId);
      setRunEvents((events) => [...events.slice(-300), event]);
      if (event.type === "closed" || event.type === "error") {
        setIsRunning(false);
        void Promise.all([
          window.skillSpace.listRuns(),
          window.skillSpace.scanSkills(),
          window.skillSpace.listSchedules(),
          window.skillSpace.listSkillChanges()
        ]).then(([runs, skills, nextSchedules, changes]) => {
          setRunHistory(runs);
          setSchedules(nextSchedules);
          setSkillChanges(changes);
          setPayload((current) => (current ? { ...current, runs, skills, schedules: nextSchedules } : current));
          setSelectedSkillId((current) => current ?? skills[0]?.id ?? null);
        });
      }
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void window.skillSpace.getFeishuStatus().then(setFeishuStatus).catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail(): Promise<void> {
      if (!selectedSkillId) {
        setSelectedSkillDetail(null);
        return;
      }

      setSelectedSkillDetail(null);
      try {
        const detail = await window.skillSpace.getSkillDetail(selectedSkillId);
        if (!cancelled) {
          setSelectedSkillDetail(detail);
        }
      } catch {
        if (!cancelled) {
          setSelectedSkillDetail(null);
        }
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedSkillId]);

  useEffect(() => {
    let cancelled = false;

    async function loadArtifacts(): Promise<void> {
      if (!selectedRunId) {
        setRunArtifacts([]);
        return;
      }

      try {
        const artifacts = await window.skillSpace.listRunArtifacts(selectedRunId);
        if (!cancelled) {
          setRunArtifacts(artifacts);
        }
      } catch {
        if (!cancelled) {
          setRunArtifacts([]);
        }
      }
    }

    void loadArtifacts();
    return () => {
      cancelled = true;
    };
  }, [selectedRunId, runHistory]);

  useEffect(() => {
    if (selectedSkill && selectedSkill.runtimes.includes(selectedSkill.defaultRuntime)) {
      setSelectedAgent(selectedSkill.defaultRuntime);
    }
  }, [selectedSkill?.id]);

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }

    let cancelled = false;
    void window.skillSpace.getRunEvents(selectedRunId).then((events) => {
      if (!cancelled) {
        setRunEvents(events.slice(-300));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  const onlineCount = payload?.agents.filter((agent) => agent.status === "online").length ?? 0;
  const pageTitle =
    activeView === "dashboard"
      ? t("dashboard.title")
      : activeView === "skills"
        ? displaySkillName(selectedSkill) || t("panel.skills")
        : t(navItems.find((item) => item.id === activeView)?.labelKey ?? "nav.dashboard");

  return (
    <main className={`app-shell theme-${theme}`}>
      <div className="ambient-field" />

      <aside className="side-rail glass-panel">
        <div className="brand-mark">
          <div className="brand-glyph">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>{t("app.title")}</strong>
            <span>{t("app.subtitle")}</span>
          </div>
        </div>

        <nav className="nav-stack">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-button ${activeView === item.id ? "active" : ""}`}
                onClick={() => setActiveView(item.id)}
                type="button"
                title={t(item.labelKey)}
              >
                <Icon size={18} />
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        <div className="rail-footer">
          <div className="mini-status">
            <Database size={16} />
            <span>{payload?.config.dataRoot ?? "D:\\Skill-Space"}</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="top-bar glass-panel">
          <div className="page-heading">
            <span>{t(navItems.find((item) => item.id === activeView)?.labelKey ?? "nav.dashboard")}</span>
            <strong>{pageTitle}</strong>
          </div>

          <div className="top-actions">
            <select
              className="glass-select"
              value={selectedAgent}
              onChange={(event) => setSelectedAgent(event.target.value as AgentId)}
              aria-label={t("run.agent")}
            >
              {payload &&
                (Object.keys(payload.config.agents) as AgentId[]).map((id) => (
                  <option key={id} value={id} disabled={!payload.config.agents[id].enabled}>
                    {payload.config.agents[id].label}
                  </option>
                ))}
            </select>
            <button className="icon-button" onClick={() => void refresh()} type="button" title={t("action.refresh")}>
              <RefreshCw size={17} className={isRefreshing ? "spin" : ""} />
            </button>
            <button
              className={`icon-button update-top-status ${updateStatus?.state ?? "idle"}`}
              onClick={() =>
                updateStatus?.state === "downloaded"
                  ? void installUpdate()
                  : updateStatus?.state === "available"
                    ? setIsUpdateDialogOpen(true)
                    : void checkUpdate()
              }
              type="button"
              title={updateStatus?.detail ?? t("update.check")}
            >
              <DownloadCloud size={17} className={updateStatus?.state === "checking" || updateStatus?.state === "downloading" ? "spin" : ""} />
            </button>
            {updateMessage && <span className={`top-status-copy ${updateStatus?.state ?? "idle"}`}>{updateMessage}</span>}
            <button
              className="icon-button"
              onClick={toggleTheme}
              type="button"
              title={theme === "dark" ? t("action.themeLight") : t("action.themeDark")}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              className={`icon-button feishu-top-status ${feishuStatus?.state ?? "not_configured"}`}
              onClick={() => setActiveView("feishu")}
              type="button"
              title={`${t("nav.feishu")}: ${t(`feishu.state.${feishuStatus?.state ?? "not_configured"}`)}`}
            >
              <MessageCircle size={17} />
            </button>
            <button className="secondary-button" onClick={() => void importSkill()} type="button">
              <FolderInput size={16} />
              <span>{t("action.import")}</span>
            </button>
            <button
              className="primary-button"
              onClick={() => void runSelectedSkill()}
              type="button"
              disabled={!selectedSkill || isRunning}
            >
              <Play size={16} />
              <span>{t("action.run")}</span>
            </button>
            <div className="window-controls">
              <button
                className="window-button"
                onClick={() => void window.skillSpace.minimizeWindow()}
                type="button"
                title={t("action.minimize")}
              >
                <Minus size={15} />
              </button>
              <button
                className="window-button"
                onClick={() => void window.skillSpace.toggleMaximizeWindow()}
                type="button"
                title={t("action.maximize")}
              >
                <Maximize2 size={14} />
              </button>
              <button
                className="window-button close"
                onClick={() => void window.skillSpace.closeWindow()}
                type="button"
                title={t("action.close")}
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </header>

        <div className={`content-grid ${activeView === "feishu" || activeView === "settings" ? "no-inspector" : ""}`}>
          <section className="main-stage">
            <MetricStrip
              t={t}
              skillCount={payload?.skills.length ?? 0}
              onlineCount={onlineCount}
              runtime={payload?.config.defaultRuntime ?? "claude"}
              permissions={payload?.config.permissionsMode ?? "full"}
            />

            {activeView === "dashboard" && (
              <DashboardPanel
                skills={payload?.skills ?? []}
                agents={payload?.agents ?? []}
                locale={locale}
                aliases={skillAliases}
                llmPrompt={llmPrompt}
                llmResult={llmResult}
                stewardMessages={stewardMessages}
                isLlmBusy={isLlmBusy}
                llmStatus={llmStatus}
                onLlmPromptChange={setLlmPrompt}
                onAskLlm={() => void askLlm()}
                onClearStewardChat={clearStewardChat}
                t={t}
                onOpenSkills={() => setActiveView("skills")}
                onOpenRuns={() => setActiveView("runs")}
                onSelectSkill={(skill) => {
                  setSelectedSkillId(skill.id);
                  setActiveView("skills");
                }}
              />
            )}

            {activeView === "skills" && (
              <SkillLibrary
                locale={locale}
                skills={filteredSkills}
                allTags={allSkillTags}
                skillQuery={skillQuery}
                selectedTag={selectedTag}
                favoritesOnly={favoritesOnly}
                favoriteSkillIds={favoriteSkillIds}
                aliases={skillAliases}
                discoveredSkills={discoveredSkills}
                selectedSkill={selectedSkill}
                onSelect={(skill) => setSelectedSkillId(skill.id)}
                onQueryChange={setSkillQuery}
                onTagChange={setSelectedTag}
                onFavoritesOnlyChange={setFavoritesOnly}
                onToggleFavorite={toggleFavoriteSkill}
                onClassifyTags={() => void classifySkillTags()}
                onDeleteSkill={() => void deleteSelectedSkill()}
                onDiscover={() => void discoverExistingSkills()}
                isDiscovering={isDiscovering}
                isClassifyingTags={isClassifyingTags}
                t={t}
              />
            )}

            {activeView === "agents" && <AgentPanel agents={payload?.agents ?? []} t={t} />}

            {activeView === "feishu" && (
              <FeishuPanel
                feishuStatus={feishuStatus}
                locale={locale}
                onStartFeishuConnect={() => void startFeishuConnect()}
                onSaveFeishuConfig={(request) => void saveFeishuConfig(request)}
                onFeishuEnabledChange={(enabled) => void setFeishuEnabled(enabled)}
                onSendFeishuTest={() => void sendFeishuTest()}
                t={t}
              />
            )}

            {activeView === "runs" && (
              <RunConsole
                events={runEvents}
                selectedRun={selectedRun}
                locale={locale}
                aliases={skillAliases}
                t={t}
                onClear={() => setRunEvents([])}
                followUpInput={followUpInput}
                onFollowUpInputChange={setFollowUpInput}
                onContinue={() => void continueSelectedRun()}
                isRunning={isRunning}
              />
            )}

            {activeView === "automations" && selectedSkill && (
              <AutomationPanel
                skills={payload?.skills ?? []}
                schedules={schedules}
                selectedSkill={selectedSkill}
                selectedAgent={selectedAgent}
                scheduleName={scheduleName}
                scheduleInput={scheduleInput}
                scheduleCadence={scheduleCadence}
                scheduleTime={scheduleTime}
                scheduleInterval={scheduleInterval}
                scheduleDayOfWeek={scheduleDayOfWeek}
                scheduleDayOfMonth={scheduleDayOfMonth}
                locale={locale}
                t={t}
                onSelectSkill={(skill) => setSelectedSkillId(skill.id)}
                onAgentChange={setSelectedAgent}
                onNameChange={setScheduleName}
                onInputChange={setScheduleInput}
                onCadenceChange={setScheduleCadence}
                onTimeChange={setScheduleTime}
                onIntervalChange={setScheduleInterval}
                onDayOfWeekChange={setScheduleDayOfWeek}
                onDayOfMonthChange={setScheduleDayOfMonth}
                onCreate={() => void createAutomation()}
                onToggle={(task) => void toggleAutomation(task)}
                onDelete={(taskId) => void deleteAutomation(taskId)}
              />
            )}

            {activeView === "settings" && payload && (
              <SettingsPanel
                locale={locale}
                supported={payload.config.locale.supported}
                onLocaleChange={changeLocale}
                payload={payload}
                llmStatus={llmStatus}
                onSaveLlmConfig={(request) => void saveLlmConfig(request)}
                onTestLlm={() => void testLlmConnection()}
                isTestingLlm={isTestingLlm}
                llmConfigMessage={llmConfigMessage}
                useParameterForm={useParameterForm}
                onUseParameterFormChange={toggleParameterForm}
                backgroundScheduler={backgroundScheduler}
                onBackgroundSchedulerChange={(enabled) => void toggleBackgroundScheduler(enabled)}
                t={t}
              />
            )}
          </section>

          {activeView !== "feishu" && activeView !== "settings" && <aside className="inspector glass-panel">
            {activeView === "runs" ? (
              <RunSidePanel
                selectedRun={selectedRun}
                history={runHistory}
                artifacts={runArtifacts}
                locale={locale}
                aliases={skillAliases}
                t={t}
                onSelectRun={(run) => setSelectedRunId(run.runId)}
                onDeleteRun={(run) => void deleteRun(run)}
                onOpenRunFolder={() => void openSelectedRunFolder()}
              />
            ) : (
              <SkillInspector
                key={selectedSkill?.id ?? "empty"}
                skill={selectedSkill}
                detail={selectedSkillDetail}
                locale={locale}
                displayName={displaySkillName(selectedSkill)}
                alias={selectedSkill ? skillAliases[selectedSkill.id] ?? "" : ""}
                onAliasChange={(alias) => selectedSkill && updateSkillAlias(selectedSkill.id, alias)}
                agents={availableAgents}
                selectedAgent={selectedAgent}
                onAgentChange={setSelectedAgent}
                runInput={runInput}
                onRunInputChange={setRunInput}
                onRun={() => void runSelectedSkill()}
                onSummarize={() => void summarizeSelectedSkill()}
                isRunning={isRunning}
                isSummarizing={isSummarizing}
                useParameterForm={useParameterForm}
                skillChanges={skillChanges.filter((change) => change.skillId === selectedSkill?.id).slice(0, 3)}
                t={t}
              />
            )}
          </aside>}
        </div>
      </section>
      {isDiscoveryOpen && (
        <DiscoveryModal
          discoveredSkills={discoveredSkills}
          isDiscovering={isDiscovering}
          onClose={() => setIsDiscoveryOpen(false)}
          onRescan={() => void discoverExistingSkills()}
          onImportDiscovered={(root) => void importExistingSkill(root)}
          t={t}
        />
      )}
      {isUpdateDialogOpen && updateStatus?.state === "available" && (
        <UpdateModal
          status={updateStatus}
          onClose={() => setIsUpdateDialogOpen(false)}
          onDownload={() => {
            setIsUpdateDialogOpen(false);
            void downloadUpdate();
          }}
          t={t}
        />
      )}
    </main>
  );
}

function DashboardPanel({
  skills,
  agents,
  locale,
  aliases,
  llmPrompt,
  llmResult,
  stewardMessages,
  isLlmBusy,
  llmStatus,
  onLlmPromptChange,
  onAskLlm,
  onClearStewardChat,
  t,
  onOpenSkills,
  onOpenRuns,
  onSelectSkill
}: {
  skills: SkillSummary[];
  agents: AgentHealth[];
  locale: Locale;
  aliases: Record<string, string>;
  llmPrompt: string;
  llmResult: string;
  stewardMessages: StewardChatMessage[];
  isLlmBusy: boolean;
  llmStatus: LlmManagerStatus | null;
  onLlmPromptChange: (value: string) => void;
  onAskLlm: () => void;
  onClearStewardChat: () => void;
  t: (key: string) => string;
  onOpenSkills: () => void;
  onOpenRuns: () => void;
  onSelectSkill: (skill: SkillSummary) => void;
}): ReactElement {
  const recentSkills = skills.slice(0, 4);

  return (
    <section className="dashboard-grid">
      <article className="dashboard-hero glass-panel">
        <div>
          <span>{t("dashboard.registryReady")}</span>
          <strong>{t("dashboard.title")}</strong>
          <p>{t("dashboard.subtitle")}</p>
        </div>
        <div className="dashboard-actions">
          <button className="dashboard-skill-button" onClick={onOpenSkills} type="button">
            <Boxes size={16} />
            <span>{t("dashboard.openSkills")}</span>
          </button>
          <button className="secondary-button" onClick={onOpenRuns} type="button">
            <TerminalSquare size={16} />
            <span>{t("dashboard.openRuns")}</span>
          </button>
        </div>
      </article>

      <article className="dashboard-section steward-chat glass-panel">
        <div className="section-title">
          <div>
            <Wand2 size={18} />
            <strong>{t("dashboard.stewardChat")}</strong>
          </div>
          <span className={`steward-state ${llmStatus?.configured ? "ready" : "muted"}`}>
            {llmStatus?.configured ? t("llm.ready") : t("llm.notReady")}
          </span>
          <button className="text-button compact" onClick={onClearStewardChat} type="button" disabled={isLlmBusy && stewardMessages.length === 0}>
            {t("action.clear")}
          </button>
        </div>
        <div className="steward-chat-body">
          <div className="steward-message-list">
            {stewardMessages.length === 0 ? (
              <div className="steward-message assistant">
                <strong>{llmStatus?.identity ?? "Skill-Space 管家"}</strong>
                <p>{llmResult || llmStatus?.detail || t("dashboard.stewardHint")}</p>
              </div>
            ) : (
              stewardMessages.map((message, index) => (
                <div className={`steward-message ${message.role}`} key={`${message.at}-${index}`}>
                  <strong>{message.role === "user" ? t("dashboard.you") : llmStatus?.identity ?? "Skill-Space 管家"}</strong>
                  <p>{message.content}</p>
                </div>
              ))
            )}
          </div>
          <div className="steward-input-row">
            <textarea
              value={llmPrompt}
              onChange={(event) => onLlmPromptChange(event.target.value)}
              placeholder={t("dashboard.stewardPlaceholder")}
            />
            <button className="primary-button" onClick={onAskLlm} type="button" disabled={isLlmBusy || !llmPrompt.trim()}>
              {isLlmBusy ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              <span>{t("action.send")}</span>
            </button>
          </div>
        </div>
      </article>

      <article className="dashboard-section recent-skills glass-panel">
        <div className="section-title">
          <div>
            <Boxes size={18} />
            <strong>{t("dashboard.recentSkills")}</strong>
          </div>
        </div>
        {recentSkills.length === 0 ? (
          <span className="muted">{t("dashboard.noRecent")}</span>
        ) : (
          <div className="recent-list">
            {recentSkills.map((skill) => (
              <button className="recent-row" key={skill.id} onClick={() => onSelectSkill(skill)} type="button">
                <div>
                  <strong>{aliases[skill.id]?.trim() || skill.name}</strong>
                  <span>{skill.description}</span>
                </div>
                <b>{formatDate(skill.updatedAt, locale)}</b>
              </button>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

function MetricStrip({
  t,
  skillCount,
  onlineCount,
  runtime,
  permissions
}: {
  t: (key: string) => string;
  skillCount: number;
  onlineCount: number;
  runtime: string;
  permissions: string;
}): ReactElement {
  const metrics = [
    { label: t("metric.skills"), value: String(skillCount), icon: Boxes },
    { label: t("metric.agents"), value: String(onlineCount), icon: Cable },
    { label: t("metric.runtime"), value: runtime, icon: Gauge },
    { label: t("metric.permissions"), value: permissions, icon: Command }
  ];

  return (
    <div className="metric-strip">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <article className="metric glass-panel" key={metric.label}>
            <Icon size={18} />
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        );
      })}
    </div>
  );
}

function SkillLibrary({
  skills,
  allTags,
  skillQuery,
  selectedTag,
  favoritesOnly,
  favoriteSkillIds,
  aliases,
  discoveredSkills,
  selectedSkill,
  onSelect,
  onQueryChange,
  onTagChange,
  onFavoritesOnlyChange,
  onToggleFavorite,
  onClassifyTags,
  onDeleteSkill,
  onDiscover,
  isDiscovering,
  isClassifyingTags,
  locale,
  t
}: {
  skills: SkillSummary[];
  allTags: string[];
  skillQuery: string;
  selectedTag: string;
  favoritesOnly: boolean;
  favoriteSkillIds: string[];
  aliases: Record<string, string>;
  discoveredSkills: DiscoveredSkill[];
  selectedSkill: SkillSummary | null;
  onSelect: (skill: SkillSummary) => void;
  onQueryChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onFavoritesOnlyChange: (value: boolean) => void;
  onToggleFavorite: (skillId: string) => void;
  onClassifyTags: () => void;
  onDeleteSkill: () => void;
  onDiscover: () => void;
  isDiscovering: boolean;
  isClassifyingTags: boolean;
  locale: Locale;
  t: (key: string) => string;
}): ReactElement {
  const hasFilters = Boolean(skillQuery.trim()) || selectedTag !== "all" || favoritesOnly;

  if (skills.length === 0 && !hasFilters) {
    return (
      <section className="skill-library-shell">
        <div className="empty-state glass-panel">
          <FolderInput size={30} />
          <strong>{t("skill.empty")}</strong>
          <span>{t("skill.emptyDetail")}</span>
          <button className="secondary-button" onClick={onDiscover} type="button" disabled={isDiscovering}>
            {isDiscovering ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            <span>{t("skill.discover")}</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="skill-library-shell">
      <div className="skill-library-actions glass-panel">
        <div>
          <strong>{t("skill.localLibrary")}</strong>
          <span>{t("skill.localLibraryHint")}</span>
        </div>
        <div className="inline-actions">
          <button className="secondary-button" onClick={onDiscover} type="button" disabled={isDiscovering}>
            {isDiscovering ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            <span>{t("skill.discover")}</span>
          </button>
          <button className="secondary-button" onClick={onClassifyTags} type="button" disabled={isClassifyingTags}>
            {isClassifyingTags ? <Loader2 size={16} className="spin" /> : <Tags size={16} />}
            <span>{t("skill.classifyTags")}</span>
          </button>
          <button className="text-button danger" onClick={onDeleteSkill} type="button" disabled={!selectedSkill}>
            <Trash2 size={15} />
            {t("action.delete")}
          </button>
        </div>
      </div>

      <div className="skill-filter-bar glass-panel">
        <label className="search-box">
          <Search size={16} />
          <input value={skillQuery} onChange={(event) => onQueryChange(event.target.value)} placeholder={t("skill.searchPlaceholder")} />
        </label>
        <select className="glass-select compact-select" value={selectedTag} onChange={(event) => onTagChange(event.target.value)}>
          <option value="all">{t("skill.allTags")}</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <button className={`text-button ${favoritesOnly ? "active" : ""}`} onClick={() => onFavoritesOnlyChange(!favoritesOnly)} type="button">
          <Star size={15} />
          {t("skill.favorites")}
        </button>
      </div>

      <div className="skill-grid">
        {skills.length === 0 ? (
          <div className="empty-state compact glass-panel">
            <Search size={24} />
            <strong>{t("skill.noMatches")}</strong>
          </div>
        ) : skills.map((skill) => (
          <button
            className={`skill-card glass-panel ${selectedSkill?.id === skill.id ? "selected" : ""}`}
            key={skill.id}
            onClick={() => onSelect(skill)}
            type="button"
          >
            <div className="skill-card-head">
              <div>
                <strong>{aliases[skill.id]?.trim() || skill.name}</strong>
                <span>{skill.id}</span>
              </div>
              <span
                className={`favorite-toggle ${favoriteSkillIds.includes(skill.id) ? "active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite(skill.id);
                }}
                role="button"
                tabIndex={0}
                title={t("skill.favorite")}
              >
                <Star size={16} />
              </span>
            </div>
            <p>{skill.description}</p>
            <div className="chip-row">
              <span className="chip">{skill.defaultRuntime}</span>
              <span className="chip">{t("view.version")} {skill.version}</span>
              <span className="chip">{formatDate(skill.updatedAt, locale)}</span>
              {skill.tags.slice(0, 2).map((tag) => (
                <span className="chip" key={tag}>
                  <Tags size={12} />
                  {tag}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function DiscoveryModal({
  discoveredSkills,
  isDiscovering,
  onClose,
  onRescan,
  onImportDiscovered,
  t
}: {
  discoveredSkills: DiscoveredSkill[];
  isDiscovering: boolean;
  onClose: () => void;
  onRescan: () => void;
  onImportDiscovered: (root: string) => void;
  t: (key: string) => string;
}): ReactElement {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="discovery-modal glass-panel" role="dialog" aria-modal="true" aria-label={t("skill.discovered")}>
        <div className="modal-title">
          <div>
            <FolderInput size={18} />
            <strong>{t("skill.discovered")}</strong>
          </div>
          <div className="inline-actions">
            <button className="text-button" onClick={onRescan} type="button" disabled={isDiscovering}>
              {isDiscovering ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
              {t("action.refresh")}
            </button>
            <button className="icon-button" onClick={onClose} type="button" title={t("action.close")}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="discovered-list">
          {discoveredSkills.length === 0 ? (
            <span className="muted">{isDiscovering ? t("status.checking") : t("view.none")}</span>
          ) : (
            discoveredSkills.map((skill) => (
              <div className={`discovered-row ${skill.installed ? "installed" : ""}`} key={skill.sourceRoot}>
                <div>
                  <strong>{skill.name}</strong>
                  <span>{skill.description}</span>
                  <code>{skill.sourceRoot}</code>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => onImportDiscovered(skill.sourceRoot)}
                  type="button"
                  disabled={skill.installed}
                >
                  <FolderInput size={15} />
                  <span>{skill.installed ? t("skill.installed") : t("action.import")}</span>
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function UpdateModal({
  status,
  onClose,
  onDownload,
  t
}: {
  status: UpdateStatus;
  onClose: () => void;
  onDownload: () => void;
  t: (key: string) => string;
}): ReactElement {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="update-modal glass-panel" role="dialog" aria-modal="true" aria-label={t("update.title")}>
        <div className="modal-title">
          <div>
            <DownloadCloud size={18} />
            <strong>{t("update.title")}</strong>
          </div>
          <button className="icon-button" onClick={onClose} type="button" title={t("action.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="update-summary">
          <span>{t("update.current")}: {status.currentVersion}</span>
          <strong>{t("update.available")}: {status.availableVersion ?? t("view.none")}</strong>
          {status.releaseName && <p>{status.releaseName}</p>}
        </div>
        <div className="update-notes">
          <strong>{t("update.notes")}</strong>
          <pre>{status.releaseNotes?.trim() || t("update.noNotes")}</pre>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            {t("update.later")}
          </button>
          <button className="primary-button" onClick={onDownload} type="button">
            <DownloadCloud size={16} />
            <span>{t("update.download")}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function DetailBlock({ title, content }: { title: string; content?: string }): ReactElement {
  const [isVisible, setIsVisible] = useState(true);

  if (!content) {
    return <></>;
  }

  return (
    <div className={`detail-block ${isVisible ? "" : "collapsed"}`}>
      <div className="detail-block-title">
        <div>
          <FileText size={15} />
          <strong>{title}</strong>
        </div>
        <button
          className="icon-button tiny"
          onClick={() => setIsVisible((current) => !current)}
          type="button"
          title={isVisible ? "Hide" : "Show"}
        >
          {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {isVisible && <pre>{content}</pre>}
    </div>
  );
}

function AgentPanel({ agents, t }: { agents: AgentHealth[]; t: (key: string) => string }): ReactElement {
  return (
    <section className="agent-list">
      {agents.map((agent) => {
        const Icon = statusIcon[agent.status];
        return (
          <article className="agent-row glass-panel" key={agent.id}>
            <div className={`agent-status ${agent.status}`}>
              <Icon size={18} className={agent.status === "checking" ? "spin" : ""} />
            </div>
            <div>
              <strong>{agent.label}</strong>
              <span>{agent.command ?? agent.id}</span>
            </div>
            <p>{agent.detail}</p>
            <b>{t(`status.${agent.status}`)}</b>
          </article>
        );
      })}
    </section>
  );
}

function RunConsole({
  events,
  selectedRun,
  locale,
  aliases,
  t,
  onClear,
  followUpInput,
  onFollowUpInputChange,
  onContinue,
  isRunning
}: {
  events: RunEvent[];
  selectedRun: RunSummary | null;
  locale: Locale;
  aliases: Record<string, string>;
  t: (key: string) => string;
  onClear: () => void;
  followUpInput: string;
  onFollowUpInputChange: (value: string) => void;
  onContinue: () => void;
  isRunning: boolean;
}): ReactElement {
  const canContinue = Boolean(selectedRun?.sessionId && selectedRun.runtime === "claude" && followUpInput.trim());

  return (
    <section className="run-grid">
      <article className="console glass-panel">
        <div className="section-title">
          <div>
            <ScrollText size={18} />
            <strong>{t("run.live")}</strong>
          </div>
          <button className="text-button" onClick={onClear} type="button">
            {t("action.clear")}
          </button>
        </div>
        <div className="console-body">
          {events.length === 0 ? (
            <span className="muted">{t("run.empty")}</span>
          ) : (
            events.map((event, index) => (
              <pre className={`log-line ${event.type}`} key={`${event.runId}-${index}`}>
                <span>{formatDate(event.timestamp, locale)}</span>
                {event.message}
              </pre>
            ))
          )}
        </div>
      </article>
      <article className="follow-up-panel glass-panel">
        <div className="section-title">
          <div>
            <Send size={18} />
            <strong>{t("run.continue")}</strong>
          </div>
          {selectedRun && <span className="muted">{aliases[selectedRun.skillId]?.trim() || selectedRun.skillName}</span>}
        </div>
        <div className="follow-up-composer">
          <textarea
            value={followUpInput}
            onChange={(event) => onFollowUpInputChange(event.target.value)}
            placeholder={t("run.followUpPlaceholder")}
            disabled={!selectedRun?.sessionId || selectedRun.runtime !== "claude" || isRunning}
          />
          <button className="primary-button" onClick={onContinue} type="button" disabled={!canContinue || isRunning}>
            {isRunning ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
            <span>{t("action.send")}</span>
          </button>
        </div>
      </article>
    </section>
  );
}

function RunSidePanel({
  selectedRun,
  history,
  artifacts,
  locale,
  aliases,
  t,
  onOpenRunFolder,
  onSelectRun,
  onDeleteRun
}: {
  selectedRun: RunSummary | null;
  history: RunSummary[];
  artifacts: RunArtifact[];
  locale: Locale;
  aliases: Record<string, string>;
  t: (key: string) => string;
  onOpenRunFolder: () => void;
  onSelectRun: (run: RunSummary) => void;
  onDeleteRun: (run: RunSummary) => void;
}): ReactElement {
  return (
    <div className="run-side-content">
      <article className="run-history glass-panel">
        <div className="section-title">
          <div>
            <History size={18} />
            <strong>{t("run.history")}</strong>
          </div>
        </div>
        <div className="run-history-list">
          {history.length === 0 ? (
            <span className="muted">{t("run.noHistory")}</span>
          ) : (
            history.map((run) => (
              <button
                className={`run-history-row ${run.status} ${selectedRun?.runId === run.runId ? "selected" : ""}`}
                key={run.runId}
                onClick={() => onSelectRun(run)}
                type="button"
              >
                <div>
                  <strong>{aliases[run.skillId]?.trim() || run.skillName}</strong>
                  <span>
                    {formatDate(run.startedAt, locale)} - {run.runtime}
                  </span>
                </div>
                <b>{t(`status.${run.status}`)}</b>
                <span
                  className="row-delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteRun(run);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onDeleteRun(run);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  title={t("action.delete")}
                >
                  <Trash2 size={15} />
                </span>
              </button>
            ))
          )}
        </div>
      </article>

      <article className="artifacts-panel glass-panel">
        <div className="section-title">
          <div>
            <FolderOpen size={18} />
            <strong>{t("run.artifacts")}</strong>
          </div>
          <button className="text-button" onClick={onOpenRunFolder} type="button" disabled={!selectedRun}>
            <FolderOpen size={15} />
            {t("action.openFolder")}
          </button>
        </div>
        <div className="artifact-list">
          {artifacts.length === 0 ? (
            <span className="muted">{t("run.noArtifacts")}</span>
          ) : (
            artifacts.map((artifact) => (
              <div className="artifact-row" key={artifact.path}>
                <FileText size={15} />
                <div>
                  <strong>{artifact.name}</strong>
                  <span>{artifact.kind} - {artifact.size ? `${Math.ceil(artifact.size / 1024)} KB` : t("view.none")}</span>
                </div>
                <time>{formatDate(artifact.updatedAt, locale)}</time>
              </div>
            ))
          )}
        </div>
      </article>
    </div>
  );
}

function AutomationPanel({
  skills,
  schedules,
  selectedSkill,
  selectedAgent,
  scheduleName,
  scheduleInput,
  scheduleCadence,
  scheduleTime,
  scheduleInterval,
  scheduleDayOfWeek,
  scheduleDayOfMonth,
  locale,
  t,
  onSelectSkill,
  onAgentChange,
  onNameChange,
  onInputChange,
  onCadenceChange,
  onTimeChange,
  onIntervalChange,
  onDayOfWeekChange,
  onDayOfMonthChange,
  onCreate,
  onToggle,
  onDelete
}: {
  skills: SkillSummary[];
  schedules: ScheduledTask[];
  selectedSkill: SkillSummary;
  selectedAgent: AgentId;
  scheduleName: string;
  scheduleInput: string;
  scheduleCadence: ScheduleCadence;
  scheduleTime: string;
  scheduleInterval: number;
  scheduleDayOfWeek: number;
  scheduleDayOfMonth: number;
  locale: Locale;
  t: (key: string) => string;
  onSelectSkill: (skill: SkillSummary) => void;
  onAgentChange: (agent: AgentId) => void;
  onNameChange: (value: string) => void;
  onInputChange: (value: string) => void;
  onCadenceChange: (value: ScheduleCadence) => void;
  onTimeChange: (value: string) => void;
  onIntervalChange: (value: number) => void;
  onDayOfWeekChange: (value: number) => void;
  onDayOfMonthChange: (value: number) => void;
  onCreate: () => void;
  onToggle: (task: ScheduledTask) => void;
  onDelete: (taskId: string) => void;
}): ReactElement {
  return (
    <section className="automation-grid">
      <article className="automation-create glass-panel">
        <div className="section-title">
          <div>
            <CalendarClock size={18} />
            <strong>{t("automation.create")}</strong>
          </div>
        </div>
        <div className="automation-form">
          <label>
            <span>{t("automation.name")}</span>
            <input value={scheduleName} onChange={(event) => onNameChange(event.target.value)} placeholder={t("automation.namePlaceholder")} />
          </label>
          <label>
            <span>{t("panel.skills")}</span>
            <select className="glass-select wide" value={selectedSkill.id} onChange={(event) => {
              const next = skills.find((skill) => skill.id === event.target.value);
              if (next) {
                onSelectSkill(next);
              }
            }}>
              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("run.agent")}</span>
            <select className="glass-select wide" value={selectedAgent} onChange={(event) => onAgentChange(event.target.value as AgentId)}>
              {selectedSkill.runtimes.map((runtime) => (
                <option key={runtime} value={runtime}>
                  {runtime}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("automation.triggerTime")}</span>
            <select className="glass-select wide" value={scheduleCadence} onChange={(event) => onCadenceChange(event.target.value as ScheduleCadence)}>
              <option value="once">{t("automation.once")}</option>
              <option value="monthly">{t("automation.monthly")}</option>
              <option value="weekly">{t("automation.weekly")}</option>
              <option value="daily">{t("automation.daily")}</option>
              <option value="interval">{t("automation.intervalTrigger")}</option>
            </select>
          </label>
          {scheduleCadence === "interval" ? (
            <label>
              <span>{t("automation.interval")}</span>
              <input type="number" min={1} value={scheduleInterval} onChange={(event) => onIntervalChange(Number(event.target.value) || 60)} />
            </label>
          ) : (
            <label>
              <span>{t("automation.time")}</span>
              <input type="time" value={scheduleTime} onChange={(event) => onTimeChange(event.target.value)} />
            </label>
          )}
          {scheduleCadence === "weekly" && (
            <label>
              <span>{t("automation.weekday")}</span>
              <select className="glass-select wide" value={scheduleDayOfWeek} onChange={(event) => onDayOfWeekChange(Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                  <option key={day} value={day}>
                    {t(`automation.weekday.${day}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {scheduleCadence === "monthly" && (
            <label>
              <span>{t("automation.monthday")}</span>
              <input type="number" min={1} max={31} value={scheduleDayOfMonth} onChange={(event) => onDayOfMonthChange(Number(event.target.value) || 1)} />
            </label>
          )}
          <label className="automation-input">
            <span>{t("run.input")}</span>
            <textarea value={scheduleInput} onChange={(event) => onInputChange(event.target.value)} placeholder={t("automation.inputPlaceholder")} />
          </label>
          <button className="primary-button wide" onClick={onCreate} type="button">
            <AlarmClock size={16} />
            <span>{t("action.save")}</span>
          </button>
        </div>
      </article>

      <article className="automation-list glass-panel">
        <div className="section-title">
          <div>
            <Clock3 size={18} />
            <strong>{t("automation.title")}</strong>
          </div>
        </div>
        <div className="automation-task-list">
          {schedules.length === 0 ? (
            <span className="muted">{t("automation.none")}</span>
          ) : (
            schedules.map((task) => (
              <div className={`automation-task ${task.enabled ? "enabled" : "paused"}`} key={task.id}>
                <div>
                  <strong>{task.name}</strong>
                  <span>{task.skillName} - {task.runtime}</span>
                </div>
                <div className="automation-times">
                  <span>{t("automation.nextRun")}: {formatDate(task.nextRunAt, locale)}</span>
                  <span>{t("automation.lastRun")}: {task.lastRunAt ? formatDate(task.lastRunAt, locale) : t("view.none")}</span>
                </div>
                <div className="automation-actions">
                  <button className="text-button" onClick={() => onToggle(task)} type="button">
                    {task.enabled ? t("action.pause") : t("action.resume")}
                  </button>
                  <button className="text-button danger" onClick={() => onDelete(task.id)} type="button" title={t("action.delete")}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}

function FeishuPanel({
  feishuStatus,
  onStartFeishuConnect,
  onSaveFeishuConfig,
  onFeishuEnabledChange,
  onSendFeishuTest,
  locale,
  t
}: {
  feishuStatus: FeishuStatus | null;
  locale: Locale;
  onStartFeishuConnect: () => void;
  onSaveFeishuConfig: (request: {
    enabled: boolean;
    appId: string;
    appSecret?: string;
    receiveId?: string;
    receiveIdType: FeishuReceiveIdType;
  }) => void;
  onFeishuEnabledChange: (enabled: boolean) => void;
  onSendFeishuTest: () => void;
  t: (key: string) => string;
}): ReactElement {
  const [feishuAppId, setFeishuAppId] = useState(feishuStatus?.appId ?? "");
  const [feishuSecret, setFeishuSecret] = useState("");
  const [feishuReceiveId, setFeishuReceiveId] = useState(feishuStatus?.receiveId ?? "");
  const [feishuReceiveIdType, setFeishuReceiveIdType] = useState<FeishuReceiveIdType>(
    feishuStatus?.receiveIdType ?? "open_id"
  );

  useEffect(() => {
    setFeishuAppId(feishuStatus?.appId ?? "");
    setFeishuReceiveId(feishuStatus?.receiveId ?? "");
    setFeishuReceiveIdType(feishuStatus?.receiveIdType ?? "open_id");
  }, [feishuStatus?.appId, feishuStatus?.receiveId, feishuStatus?.receiveIdType]);

  return (
    <section className="feishu-page">
      <article className="feishu-hero glass-panel">
        <div>
          <span>{t("feishu.kicker")}</span>
          <strong>{t("feishu.title")}</strong>
          <p>{t("feishu.subtitle")}</p>
        </div>
        <div className={`connection-badge large ${feishuStatus?.state ?? "not_configured"}`}>
          <span />
          <b>{t(`feishu.state.${feishuStatus?.state ?? "not_configured"}`)}</b>
        </div>
      </article>

      <div className="feishu-layout">
        <div className="feishu-primary-grid">
        <article className="feishu-card feishu-connect-card glass-panel">
          <div className="section-title">
            <div>
              <QrCode size={18} />
              <strong>{t("feishu.connect")}</strong>
            </div>
          </div>
          <p>{feishuStatus?.detail ?? t("status.checking")}</p>
          {feishuStatus?.lastError && <pre className="feishu-error">{feishuStatus.lastError}</pre>}
          <div className="qr-stage">
            {feishuStatus?.qrDataUrl ? (
              <>
                <img src={feishuStatus.qrDataUrl} alt={t("feishu.qrAlt")} />
                <span>{t("feishu.scanHint")}</span>
              </>
            ) : (
              <div className="qr-placeholder">
                <QrCode size={42} />
                <span>{t("feishu.qrPlaceholder")}</span>
              </div>
            )}
          </div>
          <button className="primary-button wide" onClick={onStartFeishuConnect} type="button">
            <QrCode size={16} />
            <span>{t("feishu.connect")}</span>
          </button>
        </article>

        <article className="feishu-card glass-panel">
          <div className="section-title">
            <div>
              <MessageCircle size={18} />
              <strong>{t("feishu.manualConfig")}</strong>
            </div>
          </div>
          <div className="feishu-form">
            <input value={feishuAppId} onChange={(event) => setFeishuAppId(event.target.value)} placeholder={t("feishu.appId")} />
            <input
              value={feishuSecret}
              onChange={(event) => setFeishuSecret(event.target.value)}
              placeholder={feishuStatus?.configured ? t("feishu.secretKeep") : t("feishu.appSecret")}
              type="password"
            />
            <select
              className="glass-select wide"
              value={feishuReceiveIdType}
              onChange={(event) => setFeishuReceiveIdType(event.target.value as FeishuReceiveIdType)}
            >
              <option value="open_id">{t("feishu.openId")}</option>
              <option value="chat_id">{t("feishu.chatId")}</option>
            </select>
            <input value={feishuReceiveId} onChange={(event) => setFeishuReceiveId(event.target.value)} placeholder={t("feishu.receiveId")} />
          </div>
          <div className="feishu-actions">
            <button
              className="secondary-button"
              onClick={() =>
                onSaveFeishuConfig({
                  enabled: feishuStatus?.enabled ?? true,
                  appId: feishuAppId,
                  appSecret: feishuSecret,
                  receiveId: feishuReceiveId,
                  receiveIdType: feishuReceiveIdType
                })
              }
              type="button"
            >
              {t("action.save")}
            </button>
            <button className="secondary-button" onClick={onSendFeishuTest} type="button" disabled={!feishuStatus?.canSend}>
              {t("feishu.test")}
            </button>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={Boolean(feishuStatus?.enabled)}
                onChange={(event) => onFeishuEnabledChange(event.target.checked)}
              />
              <span>{feishuStatus?.enabled ? t("action.enabled") : t("action.disabled")}</span>
            </label>
          </div>
          <div className="feishu-state-grid">
            <span>{t("feishu.lastEvent")}</span>
            <b>{feishuStatus?.lastEventAt ? formatDate(feishuStatus.lastEventAt, locale) : t("view.none")}</b>
            <span>{t("feishu.lastOutbound")}</span>
            <b>{feishuStatus?.lastOutboundAt ? formatDate(feishuStatus.lastOutboundAt, locale) : t("view.none")}</b>
            <span>{t("feishu.deliveryStatus")}</span>
            <b>{t(`feishu.delivery.${feishuStatus?.deliveryStatus ?? "idle"}`)}</b>
            <span>{t("feishu.deliveryDetail")}</span>
            <b title={feishuStatus?.deliveryDetail}>{feishuStatus?.deliveryDetail || t("view.none")}</b>
            <span>{t("feishu.receiver")}</span>
            <b>{feishuStatus?.receiveId || t("view.none")}</b>
          </div>
        </article>
        </div>

        <div className="feishu-secondary-grid">
        <article className="feishu-card feishu-message-preview glass-panel">
          <div className="section-title">
            <div>
              <ScrollText size={18} />
              <strong>{t("feishu.messagePreview")}</strong>
            </div>
            <time>{feishuStatus?.lastEventAt ? formatDate(feishuStatus.lastEventAt, locale) : t("view.none")}</time>
          </div>
          <div className="feishu-message-stack">
            <div className="feishu-message-card active">
              <span>{t("feishu.previewStarted")}</span>
              <strong>Skill-Space | {t("run.started")}</strong>
              <p>{t("feishu.previewStartedBody")}</p>
            </div>
            <div className="feishu-message-card waiting">
              <span>{t("status.waiting_input")}</span>
              <strong>{t("feishu.previewWaiting")}</strong>
              <p>{t("feishu.previewWaitingBody")}</p>
            </div>
          </div>
        </article>

        <article className="feishu-card glass-panel">
          <div className="section-title">
            <div>
              <TerminalSquare size={18} />
              <strong>{t("feishu.commands")}</strong>
            </div>
          </div>
          <div className="command-list">
            <code>/skill list</code>
            <span>{t("feishu.commandList")}</span>
            <code>/skill status</code>
            <span>{t("feishu.commandStatus")}</span>
            <code>/skill run skill-id 输入内容</code>
            <span>{t("feishu.commandRun")}</span>
          </div>
        </article>
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({
  payload,
  locale,
  supported,
  onLocaleChange,
  llmStatus,
  onSaveLlmConfig,
  onTestLlm,
  isTestingLlm,
  llmConfigMessage,
  useParameterForm,
  onUseParameterFormChange,
  backgroundScheduler,
  onBackgroundSchedulerChange,
  t
}: {
  payload: BootstrapPayload;
  locale: Locale;
  supported: Locale[];
  onLocaleChange: (locale: Locale) => void;
  llmStatus: LlmManagerStatus | null;
  onSaveLlmConfig: (request: {
    enabled: boolean;
    provider: LlmProvider;
    model: string;
    baseUrl?: string;
    apiKey?: string;
  }) => void;
  onTestLlm: () => void;
  isTestingLlm: boolean;
  llmConfigMessage: string;
  useParameterForm: boolean;
  onUseParameterFormChange: (enabled: boolean) => void;
  backgroundScheduler: BackgroundSchedulerStatus | null;
  onBackgroundSchedulerChange: (enabled: boolean) => void;
  t: (key: string) => string;
}): ReactElement {
  const [llmEnabled, setLlmEnabled] = useState(Boolean(llmStatus?.enabled ?? true));
  const [llmProvider, setLlmProvider] = useState<LlmProvider>(llmStatus?.provider ?? "claude-code");
  const [llmModel, setLlmModel] = useState(llmStatus?.model ?? "skill-space-steward");
  const [llmBaseUrl, setLlmBaseUrl] = useState(llmStatus?.baseUrl ?? "");
  const [llmApiKey, setLlmApiKey] = useState("");

  useEffect(() => {
    setLlmEnabled(Boolean(llmStatus?.enabled ?? true));
    setLlmProvider(llmStatus?.provider ?? "claude-code");
    setLlmModel(llmStatus?.model ?? "skill-space-steward");
    setLlmBaseUrl(llmStatus?.baseUrl ?? "");
  }, [llmStatus?.baseUrl, llmStatus?.enabled, llmStatus?.model, llmStatus?.provider]);

  function chooseLlmProvider(provider: LlmProvider): void {
    const next = llmProviderOptions.find((item) => item.id === provider);
    const previous = llmProviderOptions.find((item) => item.id === llmProvider);
    setLlmProvider(provider);
    if (next && (!llmModel.trim() || llmModel === previous?.model)) {
      setLlmModel(next.model);
    }
    if (next && (!llmBaseUrl.trim() || llmBaseUrl === previous?.baseUrl)) {
      setLlmBaseUrl(next.baseUrl ?? "");
    }
  }

  return (
    <section className="settings-grid">
      <article className="settings-card settings-wide glass-panel">
        <div className="section-title">
          <div>
            <Wand2 size={18} />
            <strong>{t("settings.llm")}</strong>
          </div>
        </div>
        <p>{llmStatus?.detail ?? t("settings.llmPrompt")}</p>
        <div className="llm-config-grid">
          <label className="switch-row">
            <input
              type="checkbox"
              checked={llmEnabled}
              onChange={(event) => setLlmEnabled(event.target.checked)}
            />
            <span>{llmEnabled ? t("action.enabled") : t("action.disabled")}</span>
          </label>
          <select className="glass-select wide" value={llmProvider} onChange={(event) => chooseLlmProvider(event.target.value as LlmProvider)}>
            {llmProviderOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
          <input value={llmModel} onChange={(event) => setLlmModel(event.target.value)} placeholder={t("llm.model")} />
          <input value={llmBaseUrl} onChange={(event) => setLlmBaseUrl(event.target.value)} placeholder={t("llm.baseUrl")} />
          <input
            value={llmApiKey}
            onChange={(event) => setLlmApiKey(event.target.value)}
            placeholder={t("llm.apiKey")}
            type="password"
          />
          <button
            className="secondary-button"
            onClick={() =>
              onSaveLlmConfig({
                enabled: llmEnabled,
                provider: llmProvider,
                model: llmModel,
                baseUrl: llmBaseUrl,
                apiKey: llmApiKey
              })
            }
            type="button"
          >
            {t("action.save")}
          </button>
          <button className="secondary-button" onClick={onTestLlm} type="button" disabled={isTestingLlm || !llmEnabled}>
            {isTestingLlm ? <Loader2 size={16} className="spin" /> : <Cable size={16} />}
            <span>{t("llm.test")}</span>
          </button>
        </div>
        {llmConfigMessage && <div className="inline-status">{llmConfigMessage}</div>}
      </article>

      <article className="settings-card glass-panel">
        <Globe2 size={19} />
        <label htmlFor="locale">{t("settings.language")}</label>
        <select id="locale" className="glass-select wide" value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)}>
          {supported.map((item) => (
            <option key={item} value={item}>
              {item === "zh-CN" ? t("settings.zh") : t("settings.en")}
            </option>
          ))}
        </select>
      </article>
      <article className="settings-card glass-panel">
        <FileText size={19} />
        <label>{t("settings.parameterForm")}</label>
        <p>{t("settings.parameterFormHint")}</p>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={useParameterForm}
            onChange={(event) => onUseParameterFormChange(event.target.checked)}
          />
          <span>{useParameterForm ? t("action.enabled") : t("action.disabled")}</span>
        </label>
      </article>
      <article className="settings-card glass-panel">
        <AlarmClock size={19} />
        <label>{t("settings.backgroundScheduler")}</label>
        <p>{backgroundScheduler?.detail ?? t("status.checking")}</p>
        {backgroundScheduler && (
          <div className="scheduler-status">
            <span>
              {t("settings.schedulerState")}: <b>{backgroundScheduler.state ?? t("view.none")}</b>
            </span>
            <span>
              {t("settings.schedulerNext")}: <b>{backgroundScheduler.nextRunAt ? formatDate(backgroundScheduler.nextRunAt, locale) : t("view.none")}</b>
            </span>
            <span>
              {t("settings.schedulerLast")}: <b>{backgroundScheduler.lastRunAt ? formatDate(backgroundScheduler.lastRunAt, locale) : t("view.none")}</b>
            </span>
            <span>
              {t("settings.schedulerSilent")}: <b>{backgroundScheduler.silent ? t("action.enabled") : t("action.disabled")}</b>
            </span>
          </div>
        )}
        <label className="switch-row">
          <input
            type="checkbox"
            checked={Boolean(backgroundScheduler?.enabled)}
            disabled={!backgroundScheduler?.supported}
            onChange={(event) => onBackgroundSchedulerChange(event.target.checked)}
          />
          <span>{backgroundScheduler?.enabled ? t("action.enabled") : t("action.disabled")}</span>
        </label>
      </article>
      <article className="settings-card glass-panel">
        <Database size={19} />
        <label>{t("settings.storage")}</label>
        <strong>{payload.config.dataRoot}</strong>
      </article>
      <article className="settings-card glass-panel">
        <Bot size={19} />
        <label>{t("settings.runtime")}</label>
        <strong>{payload.config.defaultRuntime}</strong>
      </article>
      <article className="settings-card glass-panel">
        <Command size={19} />
        <label>{t("settings.permissions")}</label>
        <strong>{payload.config.permissionsMode}</strong>
      </article>
    </section>
  );
}

function compactJson(value: unknown): string {
  if (!value) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

type JsonSchemaProperty = {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: Array<string | number | boolean>;
  default?: unknown;
};

function schemaProperties(schema: unknown): Array<[string, JsonSchemaProperty]> {
  if (!schema || typeof schema !== "object" || !("properties" in schema)) {
    return [];
  }

  const properties = (schema as { properties?: Record<string, JsonSchemaProperty> }).properties;
  return properties ? Object.entries(properties) : [];
}

function schemaValueType(property: JsonSchemaProperty): string {
  return Array.isArray(property.type) ? property.type[0] ?? "string" : property.type ?? "string";
}

function ParameterForm({
  schema,
  value,
  onChange,
  t
}: {
  schema: unknown;
  value: string;
  onChange: (value: string) => void;
  t: (key: string) => string;
}): ReactElement {
  const properties = schemaProperties(schema);
  const parsedValue = useMemo(() => {
    try {
      return JSON.parse(value || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  }, [value]);

  function updateField(key: string, nextValue: unknown): void {
    onChange(JSON.stringify({ ...parsedValue, [key]: nextValue }, null, 2));
  }

  if (properties.length === 0) {
    return (
      <textarea
        className="run-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("run.inputPlaceholder")}
      />
    );
  }

  return (
    <div className="parameter-form">
      {properties.map(([key, property]) => {
        const type = schemaValueType(property);
        const label = property.title ?? key;
        const current = parsedValue[key] ?? property.default ?? (type === "boolean" ? false : "");

        if (property.enum) {
          return (
            <label key={key}>
              <span>{label}</span>
              <select className="glass-select wide" value={String(current)} onChange={(event) => updateField(key, event.target.value)}>
                <option value="">{t("view.none")}</option>
                {property.enum.map((item) => (
                  <option key={String(item)} value={String(item)}>
                    {String(item)}
                  </option>
                ))}
              </select>
              {property.description && <small>{property.description}</small>}
            </label>
          );
        }

        if (type === "boolean") {
          return (
            <label className="switch-row parameter-switch" key={key}>
              <input
                type="checkbox"
                checked={Boolean(current)}
                onChange={(event) => updateField(key, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          );
        }

        return (
          <label key={key}>
            <span>{label}</span>
            <input
              type={type === "number" || type === "integer" ? "number" : "text"}
              value={String(current)}
              onChange={(event) =>
                updateField(key, type === "number" || type === "integer" ? Number(event.target.value) : event.target.value)
              }
            />
            {property.description && <small>{property.description}</small>}
          </label>
        );
      })}
    </div>
  );
}

function SkillInspector({
  skill,
  detail,
  locale,
  displayName,
  alias,
  onAliasChange,
  agents,
  selectedAgent,
  onAgentChange,
  runInput,
  onRunInputChange,
  onRun,
  onSummarize,
  isRunning,
  isSummarizing,
  useParameterForm,
  skillChanges,
  t
}: {
  skill: SkillSummary | null;
  detail: SkillDetail | null;
  locale: Locale;
  displayName: string;
  alias: string;
  onAliasChange: (alias: string) => void;
  agents: AgentHealth[];
  selectedAgent: AgentId;
  onAgentChange: (agent: AgentId) => void;
  runInput: string;
  onRunInputChange: (input: string) => void;
  onRun: () => void;
  onSummarize: () => void;
  isRunning: boolean;
  isSummarizing: boolean;
  useParameterForm: boolean;
  skillChanges: SkillChange[];
  t: (key: string) => string;
}): ReactElement {
  if (!skill) {
    return (
      <div className="inspector-empty">
        <Workflow size={24} />
        <strong>{t("panel.inspector")}</strong>
      </div>
    );
  }

  const skillMarkdown = detail?.skillMarkdown.trim();
  const workflowText = detail?.workflowText?.trim();
  const schemaText = [detail?.inputSchema, detail?.outputSchema].some(Boolean)
    ? compactJson({ input: detail?.inputSchema, output: detail?.outputSchema })
    : "";
  const permissionsText = compactJson(detail?.permissions);
  const adaptersText = compactJson(detail?.adapters);
  const files = detail?.files.slice(0, 12) ?? [];

  return (
    <div className="inspector-content">
      <div className="section-title">
        <div>
          <Workflow size={18} />
          <strong>{t("panel.inspector")}</strong>
        </div>
      </div>

      <div className="identity-block">
        <strong>{displayName}</strong>
        <p>{skill.description}</p>
        <label className="alias-field">
          <span>{t("skill.alias")}</span>
          <input value={alias} onChange={(event) => onAliasChange(event.target.value)} placeholder={skill.name} />
        </label>
        <button className="secondary-button compact" onClick={onSummarize} type="button" disabled={isSummarizing}>
          {isSummarizing ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}
          <span>{t("action.summarize")}</span>
        </button>
      </div>

      <div className="meta-list">
        <span>{t("view.version")}</span>
        <strong>{skill.version}</strong>
        <span>{t("view.recent")}</span>
        <strong>{formatDate(skill.updatedAt, locale)}</strong>
        <span>{t("skill.standard")}</span>
        <strong>{t("skill.portable")}</strong>
        <span>{t("skill.metadata")}</span>
        <strong>{skill.hasSkillSpaceMetadata ? t("skill.enhanced") : t("skill.portable")}</strong>
      </div>

      <div className="workflow-preview">
        <div className="workflow-node active">{t("workflow.skill")}</div>
        <div className="workflow-line" />
        <div className="workflow-node">{t("workflow.agent")}</div>
        <div className="workflow-line" />
        <div className="workflow-node">{t("workflow.result")}</div>
      </div>

      {skillChanges.length > 0 && (
        <div className="change-list">
          <div className="detail-block-title">
            <GitCompare size={15} />
            <strong>{t("skill.changes")}</strong>
          </div>
          {skillChanges.map((change) => (
            <div className="change-row" key={change.id}>
              <span>{formatDate(change.detectedAt, locale)}</span>
              <strong>
                {change.before?.version ?? "?"} {"->"} {change.after.version}
              </strong>
              <small>{change.after.description}</small>
            </div>
          ))}
        </div>
      )}

      {!detail && <span className="muted">{t("skill.noDetail")}</span>}

      <div className="run-control-card">
        <label className="field-label" htmlFor="agent-select">
          {t("run.agent")}
        </label>
        <select
          id="agent-select"
          className="glass-select wide"
          value={selectedAgent}
          onChange={(event) => onAgentChange(event.target.value as AgentId)}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.label}
            </option>
          ))}
        </select>

        <label className="field-label" htmlFor="run-input">
          {useParameterForm ? t("run.parameters") : t("run.input")}
        </label>
        {useParameterForm ? (
          <ParameterForm schema={detail?.inputSchema} value={runInput} onChange={onRunInputChange} t={t} />
        ) : (
          <textarea
            id="run-input"
            className="run-input"
            value={runInput}
            onChange={(event) => onRunInputChange(event.target.value)}
            placeholder={t("run.inputPlaceholder")}
          />
        )}

        <button className="primary-button wide" onClick={onRun} type="button" disabled={isRunning}>
          {isRunning ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
          <span>{t("action.run")}</span>
        </button>
      </div>

      <DetailBlock title={t("view.skillMd")} content={skillMarkdown} />
      <DetailBlock title={t("view.workflowYaml")} content={workflowText} />
      <DetailBlock title={t("view.schema")} content={schemaText} />
      <DetailBlock title={t("view.permissions")} content={permissionsText} />
      <DetailBlock title={t("view.adapters")} content={adaptersText} />

      <div className="detail-block">
        <div className="detail-block-title">
          <FileText size={15} />
          <strong>{t("skill.files")}</strong>
        </div>
        {files.length === 0 ? (
          <span className="muted">{t("view.none")}</span>
        ) : (
          <div className="file-list">
            {files.map((file) => (
              <span key={file.path}>{file.path}</span>
            ))}
          </div>
        )}
      </div>

      <div className="path-box">
        <span>{t("view.path")}</span>
        <code>{skill.root}</code>
      </div>
    </div>
  );
}
