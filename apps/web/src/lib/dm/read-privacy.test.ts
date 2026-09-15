import assert from "node:assert/strict";
import { afterEach, it, mock } from "node:test";
import { prisma } from "@wizards/db";
import { getDirectMessageParticipantReadStates, markDirectMessageRead } from "./service";
import { loadMobileDMConversationContext } from "@/lib/mobile/dm-list-enrichment";
import { updateMobileAccountSettings } from "@/app/api/v1/mobile/account/settings/route-logic";

const restores: Array<() => void> = [];
function patch(target: object, key: string, replacement: (...args: unknown[]) => unknown) {
  const record = target as Record<string, unknown>;
  const original = record[key];
  const method = mock.fn(replacement);
  record[key] = method;
  restores.push(() => {
    record[key] = original;
  });
  return method;
}
afterEach(() => {
  for (const restore of restores.splice(0).reverse()) restore();
});
const stamp = new Date("2026-09-14T08:00:00.000Z");
const participant = (userId: string, enabled: boolean) => ({
  conversationId: "conversation-1",
  userId,
  lastReadAt: stamp,
  lastDeliveredAt: stamp,
  mentionCount: 2,
  user: { isBot: false, settings: { showReadReceipts: enabled } },
});

it("redacts opted-out readers at the shared history boundary but keeps delivery", async () => {
  patch(prisma.dMParticipant, "findMany", async () => [
    participant("hidden", false),
    participant("visible", true),
  ]);
  const states = await getDirectMessageParticipantReadStates("conversation-1");
  assert.equal(states[0]?.lastReadAt, null);
  assert.equal(states[0]?.lastDeliveredAt, stamp);
  assert.equal(states[1]?.lastReadAt, stamp);
  assert.equal("user" in states[0]!, false, "private preferences must not escape the service");
});

it("does not count an opted-out reader in mobile conversation-list ticks", async () => {
  patch(prisma.dMParticipant, "findMany", async () => [
    participant("viewer", true),
    participant("hidden", false),
  ]);
  const contexts = await loadMobileDMConversationContext("viewer", ["conversation-1"]);
  assert.equal(contexts.get("conversation-1")?.othersLastReadAt, null);
  assert.equal(contexts.get("conversation-1")?.othersLastDeliveredAt, stamp);
  assert.equal(contexts.get("conversation-1")?.mentionCount, 2);
});

it("does not store private reading progress to expose after receipts are re-enabled", async () => {
  patch(prisma.dMConversation, "findUnique", async () => ({
    participants: [{ historyFromAt: null }],
    type: "DM",
  }));
  patch(prisma.userSettings, "findUnique", async () => ({
    showReadReceipts: false,
    showTypingIndicator: true,
  }));
  const update = patch(prisma.dMParticipant, "update", async () => ({}));
  await markDirectMessageRead("hidden", "conversation-1");
  const args = update.mock.calls[0]!.arguments[0] as { data: Record<string, unknown> };
  assert.equal("lastReadAt" in args.data, false);
  assert.equal(args.data.unreadCount, 0);
  assert.equal(args.data.mentionCount, 0);
});

it("persists the mobile toggle to the same column enforced by web and desktop", async () => {
  const update = patch(prisma.userSettings, "update", async () => ({
    showReadReceipts: false,
    allowGroupInvites: true,
    dmPolicy: "FRIENDS",
    friendRequestPolicy: "EVERYONE",
    messageBodyCompact: false,
    messageBodyFollowSystemFont: false,
    messageBodySize: "medium",
  }));
  const result = await updateMobileAccountSettings("viewer", { readReceipts: false });
  const args = update.mock.calls[0]!.arguments[0] as { where: unknown; data: unknown };
  assert.deepEqual(args.where, { userId: "viewer" });
  assert.deepEqual(args.data, { showReadReceipts: false });
  assert.equal(result.privacy.readReceipts, false);
});

it("advances the public watermark for an opted-in reader", async () => {
  patch(prisma.dMConversation, "findUnique", async () => ({
    participants: [{ historyFromAt: null }],
    type: "DM",
  }));
  patch(prisma.userSettings, "findUnique", async () => ({
    showReadReceipts: true,
    showTypingIndicator: true,
  }));
  const update = patch(prisma.dMParticipant, "update", async () => ({}));
  await markDirectMessageRead("viewer", "conversation-1");
  const args = update.mock.calls[0]!.arguments[0] as { data: Record<string, unknown> };
  assert.ok(args.data.lastReadAt instanceof Date);
  assert.equal(args.data.unreadCount, 0);
});
