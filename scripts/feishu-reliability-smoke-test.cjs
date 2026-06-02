const assert = require("node:assert/strict");
const loadTsService = require("./load-ts-service.cjs");

const {
  buildFeishuReceiptKey,
  feishuRetryDelayMs,
  markFeishuReceiptSeen,
  pruneFeishuReceipts,
  shouldIgnoreFeishuBotEcho
} = loadTsService("src/main/services/feishuReliability.ts");

const store = new Map();
assert.equal(markFeishuReceiptSeen(store, { messageId: "mid-1", content: "hello" }, 1000, 100), false);
assert.equal(markFeishuReceiptSeen(store, { messageId: "mid-1", content: "hello" }, 1000, 200), true);
assert.equal(store.size, 1);
assert.equal(pruneFeishuReceipts(store, 1200), 1);
assert.equal(store.size, 0);

const fallbackA = buildFeishuReceiptKey({ senderId: "u1", createdAt: "1", content: "same text" });
const fallbackB = buildFeishuReceiptKey({ senderId: "u1", createdAt: "1", content: "same text" });
const fallbackC = buildFeishuReceiptKey({ senderId: "u2", createdAt: "1", content: "same text" });
assert.equal(fallbackA, fallbackB);
assert.notEqual(fallbackA, fallbackC);

assert.equal(shouldIgnoreFeishuBotEcho("post", "Skill-Space · 系统通知\n发送时间：12:00"), true);
assert.equal(shouldIgnoreFeishuBotEcho("text", "Skill-Space · 系统通知"), false);
assert.equal(feishuRetryDelayMs(1) > 0, true);
assert.equal(feishuRetryDelayMs(10) <= 5000, true);

console.log("feishu reliability smoke test passed");
