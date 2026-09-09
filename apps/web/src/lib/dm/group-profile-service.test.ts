import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveProfileTint } from "@wizards/types";

import { ApiError } from "@/lib/api";

import {
  compareGroupMemberSortKeys,
  decodeGroupMemberCursor,
  encodeGroupMemberCursor,
  getGroupProfilePanel,
  listGroupMembers,
  normalizeGroupMemberLimit,
  requireGroupProfileContext,
  toGroupMemberRow,
  type GroupProfileConversationRow,
  type GroupProfileParticipantRow,
  type GroupProfilePresence,
  type GroupProfileServiceDependencies,
} from "./group-profile-service";

const NOW = new Date("2026-08-27T12:00:00.000Z");

function participant(
  overrides: Partial<GroupProfileParticipantRow> & { userId: string },
): GroupProfileParticipantRow {
  return {
    joinedAt: new Date("2026-03-02T09:00:00.000Z"),
    muted: false,
    mutedUntil: null,
    notifyLevel: "ALL",
    role: "MEMBER",
    user: { customStatus: null, displayName: null, username: overrides.userId },
    ...overrides,
  };
}

function conversation(
  overrides: Partial<GroupProfileConversationRow> = {},
): GroupProfileConversationRow {
  return {
    avatarColor: "primary",
    createdAt: new Date("2026-03-02T09:00:00.000Z"),
    description: "Sürüm 2.4 dağıtımını yürüten ekip.",
    historyVisibility: "LAST_30D",
    id: "group-1",
    name: "Sürüm 2.4 Ekibi",
    ownerId: "user-1",
    participants: [
      participant({
        role: "OWNER",
        user: {
          customStatus: "Odak modu · 25 dk",
          displayName: "Doğukan Yazar",
          username: "dogukan",
        },
        userId: "user-1",
      }),
      participant({
        role: "ADMIN",
        user: { customStatus: null, displayName: "Selin Aksoy", username: "selin" },
        userId: "user-2",
      }),
      participant({
        user: { customStatus: null, displayName: "Mert Kaya", username: "mert" },
        userId: "user-3",
      }),
    ],
    permAddMembers: "ALL",
    type: "GROUP_DM",
    ...overrides,
  };
}

function presence(
  status: GroupProfilePresence["status"],
  overrides: Partial<GroupProfilePresence> = {},
): GroupProfilePresence {
  return { customStatus: null, lastSeenAt: null, status, ...overrides };
}

function buildDependencies(
  overrides: Partial<GroupProfileServiceDependencies> = {},
): GroupProfileServiceDependencies {
  return {
    clearExpiredMute: async () => {
      throw new Error("clearExpiredMute should not be called in this test");
    },
    loadConversation: async () => conversation(),
    loadInvite: async () => ({ code: null, expiresAt: null, url: null }),
    loadPins: async () => [],
    now: () => NOW,
    readPresence: async (_viewerId, subjects) =>
      new Map(subjects.map((subject) => [subject.userId, presence("OFFLINE")])),
    ...overrides,
  };
}

async function statusOf(run: () => Promise<unknown>): Promise<number> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof ApiError, `expected ApiError, got ${String(error)}`);
    return error.status;
  }

  throw new Error("expected the call to throw");
}

describe("group profile gate", () => {
  it("answers 403 for a non-participant before revealing the conversation type", async () => {
    const status = await statusOf(() =>
      getGroupProfilePanel("stranger", "group-1", buildDependencies()),
    );

    assert.equal(status, 403);
  });

  it("answers 400 when the id belongs to a 1:1 DM", async () => {
    const status = await statusOf(() =>
      getGroupProfilePanel(
        "user-1",
        "dm-1",
        buildDependencies({
          loadConversation: async () =>
            conversation({
              participants: [participant({ userId: "user-1" }), participant({ userId: "user-2" })],
              type: "DM",
            }),
        }),
      ),
    );

    assert.equal(status, 400);
  });

  it("answers 404 for a conversation that does not exist", async () => {
    const status = await statusOf(() =>
      getGroupProfilePanel(
        "user-1",
        "missing",
        buildDependencies({ loadConversation: async () => null }),
      ),
    );

    assert.equal(status, 404);
  });

  it("checks membership before type so a stranger learns nothing about the row", () => {
    assert.throws(
      () => requireGroupProfileContext(conversation({ type: "DM" }), "stranger"),
      (error: unknown) => error instanceof ApiError && error.status === 403,
    );
  });
});

describe("group profile panel", () => {
  it("maps identity, counters and the viewer's own row", async () => {
    const panel = await getGroupProfilePanel(
      "user-1",
      "group-1",
      buildDependencies({
        readPresence: async (_viewerId, subjects) =>
          new Map(
            subjects.map((subject) => [
              subject.userId,
              presence(subject.userId === "user-3" ? "OFFLINE" : "ONLINE"),
            ]),
          ),
      }),
    );

    assert.equal(panel.conversationId, "group-1");
    assert.equal(panel.name, "Sürüm 2.4 Ekibi");
    // §15.1's group tile draws `S2` for this exact name — the shared initials
    // helper takes one letter from each of the first two words.
    assert.equal(panel.initials, "S2");
    assert.equal(panel.memberCount, 3);
    assert.equal(panel.onlineCount, 2);
    assert.equal(panel.ownerName, "Doğukan Yazar");
    assert.equal(panel.viewerRole, "OWNER");
    assert.equal(panel.addPolicy, "ALL");
    assert.equal(panel.historyVisibility, "LAST_30D");
    assert.equal(panel.createdAt, "2026-03-02T09:00:00.000Z");
  });

  it("counts idle and do-not-disturb members as online, matching the conversation DTO", async () => {
    const panel = await getGroupProfilePanel(
      "user-1",
      "group-1",
      buildDependencies({
        readPresence: async (_viewerId, subjects) =>
          new Map(
            subjects.map((subject, index) => [
              subject.userId,
              presence(index === 0 ? "IDLE" : index === 1 ? "DND" : "OFFLINE"),
            ]),
          ),
      }),
    );

    assert.equal(panel.onlineCount, 2);
  });

  it("keeps the stored swatch name and never emits a hex", async () => {
    const panel = await getGroupProfilePanel(
      "user-1",
      "group-1",
      buildDependencies({
        loadConversation: async () => conversation({ avatarColor: "#C77A2B" }),
      }),
    );

    assert.equal(panel.avatarColor, "warning");
  });

  it("returns invite: null when the group has no live link", async () => {
    const panel = await getGroupProfilePanel("user-1", "group-1", buildDependencies());

    assert.equal(panel.invite, null);
  });

  it("returns the code, expiry and full url when the link is on", async () => {
    const panel = await getGroupProfilePanel(
      "user-1",
      "group-1",
      buildDependencies({
        loadInvite: async () => ({
          code: "S24EKIBI",
          expiresAt: "2026-09-03T09:00:00.000Z",
          url: "https://whispr.app/g/S24EKIBI",
        }),
      }),
    );

    assert.deepEqual(panel.invite, {
      code: "S24EKIBI",
      expiresAt: "2026-09-03T09:00:00.000Z",
      url: "https://whispr.app/g/S24EKIBI",
    });
  });

  it("reports a live timed mute with its end instant", async () => {
    const panel = await getGroupProfilePanel(
      "user-1",
      "group-1",
      buildDependencies({
        loadConversation: async () =>
          conversation({
            participants: [
              participant({
                muted: true,
                mutedUntil: new Date("2026-08-27T13:00:00.000Z"),
                notifyLevel: "NONE",
                role: "OWNER",
                userId: "user-1",
              }),
            ],
          }),
      }),
    );

    assert.equal(panel.muted, true);
    assert.equal(panel.mutedUntil, "2026-08-27T13:00:00.000Z");
  });

  it("ignores an expired mute and lazily clears the row (K8)", async () => {
    const cleared: Array<{ conversationId: string; userId: string }> = [];
    const panel = await getGroupProfilePanel(
      "user-1",
      "group-1",
      buildDependencies({
        clearExpiredMute: async (conversationId, userId) => {
          cleared.push({ conversationId, userId });
        },
        loadConversation: async () =>
          conversation({
            participants: [
              participant({
                muted: true,
                mutedUntil: new Date("2026-08-27T11:00:00.000Z"),
                notifyLevel: "NONE",
                role: "OWNER",
                userId: "user-1",
              }),
            ],
          }),
      }),
    );

    assert.equal(panel.muted, false);
    assert.equal(panel.mutedUntil, null);
    assert.deepEqual(cleared, [{ conversationId: "group-1", userId: "user-1" }]);
  });

  it("leaves an indefinite mute alone and writes nothing", async () => {
    const panel = await getGroupProfilePanel(
      "user-1",
      "group-1",
      buildDependencies({
        loadConversation: async () =>
          conversation({
            participants: [
              participant({ muted: true, notifyLevel: "NONE", role: "OWNER", userId: "user-1" }),
            ],
          }),
      }),
    );

    assert.equal(panel.muted, true);
    assert.equal(panel.mutedUntil, null);
  });

  it("hands over the existing pins read rather than rebuilding one", async () => {
    const pin = {
      authorName: "Selin Aksoy",
      excerpt: "Yayın kontrol listesi",
      messageId: "message-1",
      pinnedAt: "2026-08-20T09:00:00.000Z",
      removable: true,
    };
    const panel = await getGroupProfilePanel(
      "user-1",
      "group-1",
      buildDependencies({ loadPins: async () => [pin] }),
    );

    assert.deepEqual(panel.pinnedMessages, [pin]);
  });

  it("reads presence for the whole roster but never asks for last-seen", async () => {
    const calls: Array<{ includeLastSeen: boolean; size: number }> = [];
    await getGroupProfilePanel(
      "user-1",
      "group-1",
      buildDependencies({
        readPresence: async (_viewerId, subjects, includeLastSeen) => {
          calls.push({ includeLastSeen, size: subjects.length });
          return new Map(subjects.map((subject) => [subject.userId, presence("OFFLINE")]));
        },
      }),
    );

    assert.deepEqual(calls, [{ includeLastSeen: false, size: 3 }]);
  });
});

describe("group member roster", () => {
  it("puts the admin tier first, then orders by name", async () => {
    const page = await listGroupMembers(
      "user-3",
      "group-1",
      {},
      buildDependencies({
        loadConversation: async () =>
          conversation({
            participants: [
              participant({
                user: { customStatus: null, displayName: "Zeynep Arı", username: "zeynep" },
                userId: "user-4",
              }),
              participant({
                user: { customStatus: null, displayName: "Mert Kaya", username: "mert" },
                userId: "user-3",
              }),
              participant({
                role: "ADMIN",
                user: { customStatus: null, displayName: "Selin Aksoy", username: "selin" },
                userId: "user-2",
              }),
              participant({
                role: "OWNER",
                user: { customStatus: null, displayName: "Doğukan Yazar", username: "dogukan" },
                userId: "user-1",
              }),
            ],
          }),
      }),
    );

    assert.deepEqual(
      page.items.map((item) => item.name),
      ["Doğukan Yazar", "Selin Aksoy", "Mert Kaya", "Zeynep Arı"],
    );
    assert.deepEqual(
      page.items.map((item) => item.role),
      ["OWNER", "ADMIN", "MEMBER", "MEMBER"],
    );
    assert.equal(page.total, 4);
    assert.equal(page.nextCursor, null);
  });

  it("flags only the viewer's own row with isSelf", async () => {
    const page = await listGroupMembers("user-2", "group-1", {}, buildDependencies());

    assert.deepEqual(
      page.items.filter((item) => item.isSelf).map((item) => item.userId),
      ["user-2"],
    );
  });

  it("takes the tint from the shared helper, never from nameColor", async () => {
    const page = await listGroupMembers("user-1", "group-1", {}, buildDependencies());

    for (const item of page.items) {
      assert.equal(item.tint, resolveProfileTint(item.userId));
      assert.doesNotMatch(item.tint, /^#/);
    }
  });

  it("carries the custom status as statusText and the raw last-seen beside it", async () => {
    const page = await listGroupMembers(
      "user-1",
      "group-1",
      {},
      buildDependencies({
        readPresence: async (_viewerId, subjects) =>
          new Map(
            subjects.map((subject) => [
              subject.userId,
              subject.userId === "user-1"
                ? presence("DND", { customStatus: "Odak modu · 25 dk" })
                : presence("OFFLINE", { lastSeenAt: "2026-08-26T19:10:00.000Z" }),
            ]),
          ),
      }),
    );
    const [self, ...rest] = page.items;

    assert.equal(self?.statusText, "Odak modu · 25 dk");
    assert.equal(self?.presence, "dnd");
    assert.equal(self?.lastSeenAt, null);
    assert.equal(rest[0]?.presence, "offline");
    assert.equal(rest[0]?.lastSeenAt, "2026-08-26T19:10:00.000Z");
    assert.equal(rest[0]?.statusText, null);
  });

  it("pages with a keyset cursor and stops when the roster runs out", async () => {
    const dependencies = buildDependencies();
    const first = await listGroupMembers("user-1", "group-1", { limit: 2 }, dependencies);

    assert.equal(first.items.length, 2);
    assert.equal(first.total, 3);
    assert.ok(first.nextCursor);

    const second = await listGroupMembers(
      "user-1",
      "group-1",
      { cursor: first.nextCursor, limit: 2 },
      dependencies,
    );

    assert.deepEqual(
      second.items.map((item) => item.userId),
      ["user-3"],
    );
    assert.equal(second.nextCursor, null);
    assert.equal(
      new Set([...first.items, ...second.items].map((item) => item.userId)).size,
      3,
      "the two pages cover the roster without repeating a row",
    );
  });

  it("resumes correctly when the cursor row left the group between pages", async () => {
    const full = conversation();
    const first = await listGroupMembers(
      "user-1",
      "group-1",
      { limit: 2 },
      buildDependencies({ loadConversation: async () => full }),
    );
    const second = await listGroupMembers(
      "user-1",
      "group-1",
      { cursor: first.nextCursor, limit: 2 },
      buildDependencies({
        loadConversation: async () =>
          conversation({
            participants: full.participants.filter(
              (entry) => entry.userId !== first.items[1]?.userId,
            ),
          }),
      }),
    );

    assert.deepEqual(
      second.items.map((item) => item.userId),
      ["user-3"],
    );
  });

  it("reads presence only for the page, not for the whole roster", async () => {
    const sizes: number[] = [];
    await listGroupMembers(
      "user-1",
      "group-1",
      { limit: 1 },
      buildDependencies({
        readPresence: async (_viewerId, subjects) => {
          sizes.push(subjects.length);
          return new Map(subjects.map((subject) => [subject.userId, presence("OFFLINE")]));
        },
      }),
    );

    assert.deepEqual(sizes, [1]);
  });

  it("refuses a non-participant with the same 403 the panel gives", async () => {
    const status = await statusOf(() =>
      listGroupMembers("stranger", "group-1", {}, buildDependencies()),
    );

    assert.equal(status, 403);
  });
});

describe("member roster helpers", () => {
  it("sorts admins ahead of members and breaks name ties by id", () => {
    const owner = { name: "Ada", tier: 0, userId: "user-9" };
    const member = { name: "Ada", tier: 1, userId: "user-1" };
    const twin = { name: "Ada", tier: 1, userId: "user-2" };

    assert.ok(compareGroupMemberSortKeys(owner, member) < 0);
    assert.ok(compareGroupMemberSortKeys(member, twin) < 0);
    assert.equal(compareGroupMemberSortKeys(member, member), 0);
  });

  it("orders Turkish names by Turkish rules", () => {
    const isik = { name: "Işık", tier: 1, userId: "user-1" };
    const ipek = { name: "İpek", tier: 1, userId: "user-2" };

    assert.ok(compareGroupMemberSortKeys(isik, ipek) < 0);
  });

  it("round-trips a cursor and treats a corrupt one as the start of the list", () => {
    const key = { name: "Selin Aksoy", tier: 0, userId: "user-2" };

    assert.deepEqual(decodeGroupMemberCursor(encodeGroupMemberCursor(key)), key);
    assert.equal(decodeGroupMemberCursor("not-a-cursor"), null);
    assert.equal(decodeGroupMemberCursor(null), null);
    assert.equal(decodeGroupMemberCursor(Buffer.from("{}", "utf8").toString("base64url")), null);
  });

  it("clamps the page size instead of trusting the query string", () => {
    assert.equal(normalizeGroupMemberLimit(null), 50);
    assert.equal(normalizeGroupMemberLimit(Number.NaN), 50);
    assert.equal(normalizeGroupMemberLimit(0), 1);
    assert.equal(normalizeGroupMemberLimit(9999), 100);
    assert.equal(normalizeGroupMemberLimit(12), 12);
  });

  it("falls back to the username when a member has no display name", () => {
    const row = toGroupMemberRow(
      participant({
        user: { customStatus: null, displayName: null, username: "mert" },
        userId: "user-3",
      }),
      "user-1",
      undefined,
    );

    assert.equal(row.name, "mert");
    assert.equal(row.initials, "M");
    assert.equal(row.presence, "offline");
    assert.equal(row.statusText, null);
    assert.equal(row.isSelf, false);
  });
});
