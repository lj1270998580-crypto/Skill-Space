const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(repoRoot, "src", "main", "index.ts"), "utf8");

assert.match(mainSource, /function looksLikeSkillRunRequest/, "Feishu routing must keep skill-run text out of waiting replies.");
assert.match(mainSource, /执行\|运行\|启动\|调用/, "Feishu routing must recognize Chinese skill execution verbs.");
assert.match(mainSource, /run_skill，不是等待任务回复/, "LLM router prompt must warn that skill execution is not a waiting reply.");

function looksLikeSkillRunRequest(content) {
  const text = content.trim();
  return [
    /(?:执行|运行|启动|调用|打开|添加|新增|安装).{0,16}(?:第?\s*[1-9一二两三四五六七八九]\s*个?)?技能/i,
    /(?:执行|运行|启动|调用|打开|添加|新增|安装).{0,16}(?:skill|workflow|工作流)/i,
    /第\s*[1-9一二两三四五六七八九]\s*个技能/i,
    /^\/skill\s+run\b/i
  ].some((pattern) => pattern.test(text));
}

function chineseChoiceToNumber(value) {
  const direct = value.match(/[1-9]/)?.[0];
  if (direct) return direct;
  return { 一: "1", 二: "2", 两: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9" }[value.match(/[一二两三四五六七八九]/)?.[0]];
}

function extractWaitingChoiceNumber(content) {
  const text = content.trim();
  if (looksLikeSkillRunRequest(text)) return undefined;
  const explicit =
    text.match(/(?:选题|选项|方案|选择|采用|用|按|就|第)\s*([1-9一二两三四五六七八九])\s*(?:个|项|条|题|号|方案)?/i) ??
    text.match(/^([1-9一二两三四五六七八九])$/);
  return explicit ? chineseChoiceToNumber(explicit[1]) : undefined;
}

function normalizeWaitingReplyText(value) {
  const trimmed = value.trim();
  return chineseChoiceToNumber(trimmed) ?? trimmed;
}

function pickWaitingRunReplyText(content) {
  const explicit =
    content.match(/^(?:任务|task)\s*([1-9]\d*)\s*(?:[:：\-，,]|\s+)(.+)$/i) ??
    content.match(/^run\s+([a-z0-9-]{6,})\s*(?:[:：\-，,]|\s+)(.+)$/i);
  return explicit ? normalizeWaitingReplyText(explicit[2]) : undefined;
}

const positiveChoices = new Map([
  ["4", "4"],
  ["今日选题用第四个", "4"],
  ["北陌公众号用第四个选题", "4"]
]);

for (const [input, expected] of positiveChoices) {
  assert.equal(extractWaitingChoiceNumber(input), expected, `expected waiting choice for ${input}`);
}

assert.equal(pickWaitingRunReplyText("任务2 4"), "4", "explicit task reply should keep the user choice.");
assert.equal(pickWaitingRunReplyText("任务2：选题4"), "4", "explicit numbered task reply should normalize to the chosen option.");

const skillRunRequests = [
  "执行第6个技能",
  "运行第六个技能",
  "启动第3个技能",
  "调用 skill-space 技能",
  "/skill run beimo-daily-article 今天写一篇"
];

for (const input of skillRunRequests) {
  assert.equal(looksLikeSkillRunRequest(input), true, `expected skill run request for ${input}`);
  assert.equal(extractWaitingChoiceNumber(input), undefined, `must not extract waiting choice from ${input}`);
}

console.log("feishu routing smoke test passed");
