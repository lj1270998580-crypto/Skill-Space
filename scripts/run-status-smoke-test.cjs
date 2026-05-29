const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(repoRoot, "src", "main", "index.ts"), "utf8");

assert.match(mainSource, /function isCompletionReportMessage/, "Run status must distinguish final reports from waiting prompts.");
assert.match(mainSource, /function shouldTreatRunAsCompleted/, "Run list must normalize completed exit-code-0 runs.");
assert.match(mainSource, /function formatFeishuRunDiagnostics/, "Feishu status should expose diagnostics, not only status labels.");

function powershellSingleLine(value) {
  return value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function isUserDecisionRequest(message) {
  const text = powershellSingleLine(message).toLowerCase();
  return [
    /(?:请|需要|等待|请你|麻烦|请回复|请从|请在|请告诉我|请提供|待用户|等待用户|需要用户).{0,60}(回复|选择|确认|输入|补充|提供|决定|决策|选题|编号|序号)/i,
    /(回复|选择|确认|输入|补充|提供|决定|决策).{0,40}(即可|继续|后继续|后我|后再|选题|编号|序号)/i,
    /(?:请选择|请确认|请回复|请决定|等待确认|等待回复|等待选择|需要确认|需要选择|用户确认|用户选择|用户决策)/i
  ].some((pattern) => pattern.test(message) || pattern.test(text));
}

function isCompletionReportMessage(message) {
  const text = powershellSingleLine(message).toLowerCase();
  return [
    /(?:完整\s*checklist|validation checklist|执行报告|执行总结|完整报告|最终状态\s*[:：]?.{0,12}成功|研究摘要|研究任务完成)/i,
    /(?:all checks passed|final report|execution report|validation checklist)/i,
    /(?:文章已同步|草稿箱|media_id|报告已保存|参考资料已整理|结构化研究摘要已输出)/i
  ].some((pattern) => pattern.test(message) || pattern.test(text));
}

function isActionableUserDecisionRequest(message) {
  return isUserDecisionRequest(message) && !isCompletionReportMessage(message);
}

const finalReport = "## 研究摘要\n\n**完整报告**：research/report.md\n\n## 执行总结\n✅ 研究任务完成\n下一步建议：用户确认是否启动 P0 阶段开发";
const waitingTopics = "状态：选题规划完成，等待用户选择。\n请回复数字 1/2/3/4/5 选择今天要写的选题。";
const articleComplete = "## ✅ 完整 Checklist\n最终状态：✅ 成功\n文章已同步到公众号草稿箱，请前往公众号后台查看草稿效果，确认无误后即可发布。";

assert.equal(isCompletionReportMessage(finalReport), true, "research final report should be a completion report.");
assert.equal(isActionableUserDecisionRequest(finalReport), false, "next-step suggestions must not keep the run waiting.");
assert.equal(isActionableUserDecisionRequest(waitingTopics), true, "topic selection prompt should stay waiting.");
assert.equal(isCompletionReportMessage(articleComplete), true, "article execution report should be completed.");
assert.equal(isActionableUserDecisionRequest(articleComplete), false, "external publish suggestion should not block run completion.");

console.log("run status smoke test passed");
