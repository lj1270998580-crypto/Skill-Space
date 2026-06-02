import { createHash } from "node:crypto";

export type FeishuReceiptStore = Map<string, number>;

export type FeishuReceiptInput = {
  messageId?: string;
  senderId?: string;
  createdAt?: string;
  content: string;
};

export function pruneFeishuReceipts(store: FeishuReceiptStore, now = Date.now()): number {
  let removed = 0;
  for (const [key, expiresAt] of store) {
    if (expiresAt <= now) {
      store.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function buildFeishuReceiptKey(input: FeishuReceiptInput): string | undefined {
  if (input.messageId?.trim()) {
    return input.messageId.trim();
  }
  const content = input.content.trim();
  if (!content) {
    return undefined;
  }
  return createHash("sha256")
    .update(`${input.senderId ?? "unknown"}:${input.createdAt ?? "unknown"}:${content.slice(0, 500)}`)
    .digest("hex");
}

export function markFeishuReceiptSeen(
  store: FeishuReceiptStore,
  input: FeishuReceiptInput,
  ttlMs = 10 * 60_000,
  now = Date.now()
): boolean {
  pruneFeishuReceipts(store, now);
  const key = buildFeishuReceiptKey(input);
  if (!key) {
    return false;
  }
  if (store.has(key)) {
    return true;
  }
  store.set(key, now + ttlMs);
  return false;
}

export function shouldIgnoreFeishuBotEcho(messageType: string | undefined, normalizedContent: string): boolean {
  if (messageType !== "post" && messageType !== "interactive") {
    return false;
  }
  return /^Skill-Space\s*(?:\u00b7|\||-)/i.test(normalizedContent) || /发送时间[:：]/.test(normalizedContent);
}

export function feishuRetryDelayMs(attempt: number): number {
  return Math.min(1_200 * 2 ** Math.max(0, attempt - 1), 5_000);
}
