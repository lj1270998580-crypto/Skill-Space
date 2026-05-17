const { contextBridge } = require("electron");

const now = new Date().toISOString();

contextBridge.exposeInMainWorld("skillSpace", {
  async bootstrap() {
    return {
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
          detail: "Hermes Agent",
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
        }
      ],
      runs: [
        {
          runId: "smoke",
          skillId: "skill-space-capture",
          skillName: "Skill-Space Capture",
          runtime: "codex",
          status: "completed",
          startedAt: now,
          endedAt: now,
          input: "渲染烟测",
          exitCode: 0,
          runRoot: "D:\\Skill-Space\\runs\\smoke",
          logPath: "D:\\Skill-Space\\runs\\smoke\\events.jsonl"
        }
      ]
    };
  },
  async refreshAgents() {
    return (await this.bootstrap()).agents;
  },
  async scanSkills() {
    return (await this.bootstrap()).skills;
  },
  async listRuns() {
    return (await this.bootstrap()).runs;
  },
  async getSkillDetail() {
    const skill = (await this.bootstrap()).skills[0];
    return {
      ...skill,
      skillMarkdown: `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n# ${skill.name}\n\n${skill.description}`,
      workflowText: "nodes:\n  - id: skill\n  - id: agent\n  - id: result\n",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      permissions: { mode: "full" },
      adapters: { runtimes: skill.runtimes },
      files: [{ path: "SKILL.md", kind: "file", size: 300, updatedAt: now }]
    };
  },
  async importSkill() {
    return { imported: false, message: "smoke" };
  },
  async runSkill() {
    return { runId: "smoke" };
  },
  onRunEvent() {
    return () => {};
  }
});
