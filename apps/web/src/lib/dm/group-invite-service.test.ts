import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import type { DMConversationDTO } from "@wizards/types";

import { ApiError } from "@/lib/api";

import {
  joinGroupViaInvite,
  previewGroupInvite,
  readGroupInvite,
  rotateGroupInvite,
  setGroupInviteEnabled,
  type GroupInviteConversationRow,
  type GroupInviteDependencies,
  type GroupInviteRow,
} from "./group-invite-service";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const ORIGIN = new URL("https://whispr.example.com");

function participant(
  userId: string,
  overrides: Partial<GroupInviteConversationRow["participants"][number]> = {},
): GroupInviteConversationRow["participants"][number] {
  return {
    historyFromAt: null,
    joinedAt: new Date("2026-08-01T09:00:00.000Z"),
    nameColor: "#C2185B",
    notifyLevel: "ALL",
    pinnedStripDismissedId: null,
    role: "MEMBER",
    userId,
    ...overrides,
  };
}

function conversationRow(
  overrides: Partial<GroupInviteConversationRow> = {},
): GroupInviteConversationRow {
  return {
    avatarColor: "#4F46E5",
    historyVisibility: "LAST_30D",
    iconUrl: null,
    id: "conversation-1",
    name: "Mobil Ekibi",
    ownerId: "owner-1",
    participants: [
      participant("owner-1", { nameColor: "#C2185B", role: "OWNER" }),
      participant("member-1", {
        joinedAt: new Date("2026-08-02T09:00:00.000Z"),
        nameColor: "#C77A2B",
      }),
      participant("member-2", {
        joinedAt: new Date("2026-08-03T09:00:00.000Z"),
        nameColor: "#1B8A55",
      }),
    ],
    permAddMembers: "ALL",
    permEditInfo: "ADMINS",
    permPinMessage: "ADMINS",
    permSendMessage: "ALL",
    pinnedMessageId: null,
    type: "GROUP_DM",
    ...overrides,
  };
}

function inviteRow(overrides: Partial<GroupInviteRow> = {}): GroupInviteRow {
  return {
    code: "ABCDEFGH2345",
    conversationId: "conversation-1",
    createdAt: new Date("2026-08-05T09:00:00.000Z"),
    enabled: true,
    expiresAt: null,
    id: "invite-1",
    maxUses: null,
    rotatedAt: null,
    uses: 0,
    ...overrides,
  };
}

const CONVERSATION_DTO = {
  avatarColor: "#4F46E5",
  iconUrl: null,
  id: "conversation-1",
  lastMessage: null,
  lastMessageAt: NOW.toISOString(),
  name: "Mobil Ekibi",
  ownerId: "owner-1",
  participants: [],
  type: "GROUP_DM",
} as unknown as DMConversationDTO;

type Calls = {
  generated: number;
  joins: Array<Parameters<GroupInviteDependencies["writeJoin"]>[0]>;
  upserts: Array<Parameters<GroupInviteDependencies["upsertInvite"]>[0]>;
};

function dependencies(
  overrides: Partial<GroupInviteDependencies> = {},
  state: { conversation?: GroupInviteConversationRow; invite?: GroupInviteRow | null } = {},
): { calls: Calls; deps: GroupInviteDependencies } {
  const conversation = state.conversation ?? conversationRow();
  const invite = state.invite === undefined ? inviteRow() : state.invite;
  const calls: Calls = { generated: 0, joins: [], upserts: [] };

  const deps: GroupInviteDependencies = {
    generateCode: async () => {
      calls.generated += 1;
      return `GENERATED${calls.generated}${"X".repeat(2)}`;
    },
    loadBlockedUserIds: async () => new Set<string>(),
    loadConversation: async () => conversation,
    loadConversationForViewer: async () => CONVERSATION_DTO,
    loadInviteByCode: async (code) =>
      invite && invite.code === code ? { conversation, invite } : null,
    loadInviteByConversation: async () => invite,
    now: () => NOW,
    resolveOrigin: () => ({ displayHost: "whispr.example.com", url: ORIGIN }),
    upsertInvite: async (input) => {
      calls.upserts.push(input);
      return inviteRow({
        code: input.code ?? invite?.code ?? "ABCDEFGH2345",
        enabled: input.enabled,
        ...(input.rotatedAt === undefined ? {} : { rotatedAt: input.rotatedAt, uses: 0 }),
      });
    },
    writeJoin: async (input) => {
      calls.joins.push(input);
      return true;
    },
    ...overrides,
  };

  return { calls, deps };
}

describe("setGroupInviteEnabled", () => {
  it("mints a code the first time the switch goes on", async () => {
    const { calls, deps } = dependencies({}, { invite: null });

    const result = await setGroupInviteEnabled("owner-1", "conversation-1", true, deps);

    assert.equal(calls.generated, 1);
    assert.equal(calls.upserts[0]?.enabled, true);
    assert.equal(typeof calls.upserts[0]?.code, "string");
    assert.equal(result.enabled, true);
    assert.equal(result.url, `https://whispr.example.com/g/${result.code}`);
    assert.equal(result.displayUrl, `whispr.example.com/g/${result.code}`);
  });

  it("keeps the existing code when the switch goes on again", async () => {
    const { calls, deps } = dependencies({}, { invite: inviteRow({ enabled: false }) });

    const result = await setGroupInviteEnabled("owner-1", "conversation-1", true, deps);

    // Rotation is its own action. Re-enabling must not silently break every
    // link already pasted into a chat.
    assert.equal(calls.generated, 0);
    assert.equal(calls.upserts[0]?.code, undefined);
    assert.equal(result.code, "ABCDEFGH2345");
  });

  it("hides the code once the switch goes off", async () => {
    const { deps } = dependencies();

    const result = await setGroupInviteEnabled("owner-1", "conversation-1", false, deps);

    // E2: "kapalı davet = kod yok". The row survives so re-enabling restores the
    // same link, but nothing about it leaves the server.
    assert.equal(result.enabled, false);
    assert.equal(result.code, null);
    assert.equal(result.url, null);
    assert.equal(result.displayUrl, null);
  });

  it("refuses a member without editInfo", async () => {
    const { calls, deps } = dependencies();

    await assert.rejects(
      setGroupInviteEnabled("member-1", "conversation-1", true, deps),
      (error: unknown) => error instanceof ApiError && error.status === 403,
    );
    assert.equal(calls.upserts.length, 0);
  });

  it("lets a plain member through when the group opened editInfo to everyone", async () => {
    const { calls, deps } = dependencies(
      {},
      { conversation: conversationRow({ permEditInfo: "ALL" }) },
    );

    await setGroupInviteEnabled("member-1", "conversation-1", true, deps);

    assert.equal(calls.upserts.length, 1);
  });

  it("lets an admin through on the default ADMINS setting", async () => {
    // The `role` column, not `ownerId`, is what clears `ADMINS` — reading
    // ownership alone would lock every admin out of the link they manage.
    const { calls, deps } = dependencies(
      {},
      {
        conversation: conversationRow({
          participants: [
            participant("owner-1", { role: "OWNER" }),
            participant("member-1", { role: "ADMIN" }),
            participant("member-2"),
          ],
        }),
      },
    );

    await setGroupInviteEnabled("member-1", "conversation-1", true, deps);

    assert.equal(calls.upserts.length, 1);
  });

  it("refuses a stranger before any write", async () => {
    const { calls, deps } = dependencies();

    await assert.rejects(
      setGroupInviteEnabled("stranger-1", "conversation-1", true, deps),
      (error: unknown) => error instanceof ApiError && error.status === 403,
    );
    assert.equal(calls.upserts.length, 0);
  });

  it("refuses a 1:1 conversation", async () => {
    const { deps } = dependencies({}, { conversation: conversationRow({ type: "DM" }) });

    await assert.rejects(
      setGroupInviteEnabled("owner-1", "conversation-1", true, deps),
      (error: unknown) => error instanceof ApiError && error.code === "NOT_A_GROUP",
    );
  });

  it("reports no link when the deployment has no origin configured", async () => {
    const { deps } = dependencies({ resolveOrigin: () => ({ displayHost: null, url: null }) });

    const result = await setGroupInviteEnabled("owner-1", "conversation-1", true, deps);

    assert.equal(result.url, null);
    assert.equal(result.code, "ABCDEFGH2345");
  });
});

describe("rotateGroupInvite", () => {
  it("mints a new code, resets the counter and stamps rotatedAt", async () => {
    const { calls, deps } = dependencies({}, { invite: inviteRow({ uses: 7 }) });

    const result = await rotateGroupInvite("owner-1", "conversation-1", deps);

    assert.equal(calls.generated, 1);
    assert.notEqual(calls.upserts[0]?.code, "ABCDEFGH2345");
    assert.deepEqual(calls.upserts[0]?.rotatedAt, NOW);
    assert.equal(result.uses, 0);
  });

  it("turns the invite on when it was off, because a fresh link implies sharing", async () => {
    const { calls, deps } = dependencies({}, { invite: inviteRow({ enabled: false }) });

    await rotateGroupInvite("owner-1", "conversation-1", deps);

    assert.equal(calls.upserts[0]?.enabled, true);
  });

  it("refuses a member without editInfo", async () => {
    const { calls, deps } = dependencies();

    await assert.rejects(
      rotateGroupInvite("member-1", "conversation-1", deps),
      (error: unknown) => error instanceof ApiError && error.status === 403,
    );
    assert.equal(calls.upserts.length, 0);
  });
});

describe("readGroupInvite", () => {
  it("returns the link to any member once it is on", async () => {
    const { deps } = dependencies();

    const result = await readGroupInvite("member-1", "conversation-1", deps);

    assert.equal(result.code, "ABCDEFGH2345");
  });

  it("returns a disabled shell when the group never turned it on", async () => {
    const { deps } = dependencies({}, { invite: null });

    const result = await readGroupInvite("member-1", "conversation-1", deps);

    assert.deepEqual(result, {
      code: null,
      displayUrl: null,
      enabled: false,
      expiresAt: null,
      maxUses: null,
      rotatedAt: null,
      uses: 0,
      url: null,
    });
  });

  it("refuses a stranger", async () => {
    const { deps } = dependencies();

    await assert.rejects(
      readGroupInvite("stranger-1", "conversation-1", deps),
      (error: unknown) => error instanceof ApiError && error.status === 403,
    );
  });
});

describe("previewGroupInvite", () => {
  it("describes the group without naming a single member", async () => {
    const { deps } = dependencies();

    const preview = await previewGroupInvite("ABCDEFGH2345", "stranger-1", deps);

    assert.deepEqual(preview, {
      alreadyMember: false,
      avatarColor: "#4F46E5",
      code: "ABCDEFGH2345",
      iconUrl: null,
      joinable: true,
      memberCount: 3,
      name: "Mobil Ekibi",
      reason: null,
    });
    assert.equal("participants" in preview, false);
  });

  it("404s on an unknown code", async () => {
    const { deps } = dependencies();

    await assert.rejects(
      previewGroupInvite("ZZZZZZZZZZZZ", "stranger-1", deps),
      (error: unknown) => error instanceof ApiError && error.code === "INVITE_NOT_FOUND",
    );
  });

  it("reports the reason instead of throwing for a disabled invite", async () => {
    // The page has to say *why*; a 403 with no body would render "bir sorun
    // oluştu" for every branch.
    const { deps } = dependencies({}, { invite: inviteRow({ enabled: false }) });

    const preview = await previewGroupInvite("ABCDEFGH2345", "stranger-1", deps);

    assert.equal(preview.joinable, false);
    assert.equal(preview.reason, "disabled");
  });

  it("reports a full group", async () => {
    const { deps } = dependencies(
      {},
      {
        conversation: conversationRow({
          participants: Array.from({ length: 32 }, (_unused, index) =>
            participant(`member-${index}`),
          ),
        }),
      },
    );

    const preview = await previewGroupInvite("ABCDEFGH2345", "stranger-1", deps);

    assert.equal(preview.joinable, false);
    assert.equal(preview.reason, "full");
  });

  it("reports a block", async () => {
    const { deps } = dependencies({ loadBlockedUserIds: async () => new Set(["member-1"]) });

    const preview = await previewGroupInvite("ABCDEFGH2345", "stranger-1", deps);

    assert.equal(preview.joinable, false);
    assert.equal(preview.reason, "blocked");
  });

  it("says a member is already in, and stays joinable so the page can open it", async () => {
    const { deps } = dependencies();

    const preview = await previewGroupInvite("ABCDEFGH2345", "member-1", deps);

    assert.equal(preview.alreadyMember, true);
    assert.equal(preview.joinable, true);
    assert.equal(preview.reason, null);
  });

  it("still reports membership when the invite itself went stale", async () => {
    // Somebody already inside must never be told "this link is dead" — they can
    // open the conversation regardless of the link's state.
    const { deps } = dependencies({}, { invite: inviteRow({ enabled: false }) });

    const preview = await previewGroupInvite("ABCDEFGH2345", "member-1", deps);

    assert.equal(preview.alreadyMember, true);
    assert.equal(preview.joinable, true);
  });
});

describe("joinGroupViaInvite", () => {
  it("404s on an unknown code", async () => {
    const { calls, deps } = dependencies();

    await assert.rejects(
      joinGroupViaInvite("ZZZZZZZZZZZZ", "stranger-1", deps),
      (error: unknown) =>
        error instanceof ApiError && error.status === 404 && error.code === "INVITE_NOT_FOUND",
    );
    assert.equal(calls.joins.length, 0);
  });

  it("403s on a disabled invite", async () => {
    const { calls, deps } = dependencies({}, { invite: inviteRow({ enabled: false }) });

    await assert.rejects(
      joinGroupViaInvite("ABCDEFGH2345", "stranger-1", deps),
      (error: unknown) =>
        error instanceof ApiError && error.status === 403 && error.code === "INVITE_DISABLED",
    );
    assert.equal(calls.joins.length, 0);
  });

  it("410s on an expired invite", async () => {
    const { deps } = dependencies(
      {},
      { invite: inviteRow({ expiresAt: new Date(NOW.getTime() - 1) }) },
    );

    await assert.rejects(
      joinGroupViaInvite("ABCDEFGH2345", "stranger-1", deps),
      (error: unknown) =>
        error instanceof ApiError && error.status === 410 && error.code === "INVITE_EXPIRED",
    );
  });

  it("410s on an exhausted invite", async () => {
    const { deps } = dependencies({}, { invite: inviteRow({ maxUses: 2, uses: 2 }) });

    await assert.rejects(
      joinGroupViaInvite("ABCDEFGH2345", "stranger-1", deps),
      (error: unknown) =>
        error instanceof ApiError && error.status === 410 && error.code === "INVITE_EXHAUSTED",
    );
  });

  it("returns the conversation without writing when the caller is already a member", async () => {
    const { calls, deps } = dependencies();

    const result = await joinGroupViaInvite("ABCDEFGH2345", "member-1", deps);

    assert.equal(result.alreadyMember, true);
    assert.equal(result.conversation.id, "conversation-1");
    assert.equal(calls.joins.length, 0);
  });

  it("409s when the group is full", async () => {
    const { calls, deps } = dependencies(
      {},
      {
        conversation: conversationRow({
          participants: Array.from({ length: 32 }, (_unused, index) =>
            participant(`member-${index}`),
          ),
        }),
      },
    );

    await assert.rejects(
      joinGroupViaInvite("ABCDEFGH2345", "stranger-1", deps),
      (error: unknown) =>
        error instanceof ApiError && error.status === 409 && error.code === "GROUP_FULL",
    );
    assert.equal(calls.joins.length, 0);
  });

  it("403s when somebody in the group has a block with the joiner", async () => {
    const { calls, deps } = dependencies({
      loadBlockedUserIds: async () => new Set(["member-2"]),
    });

    await assert.rejects(
      joinGroupViaInvite("ABCDEFGH2345", "stranger-1", deps),
      (error: unknown) =>
        error instanceof ApiError && error.status === 403 && error.code === "BLOCKED",
    );
    assert.equal(calls.joins.length, 0);
  });

  it("joins with a colour, a history floor and the invite marker in one write", async () => {
    const { calls, deps } = dependencies();

    const result = await joinGroupViaInvite("ABCDEFGH2345", "stranger-1", deps);

    assert.equal(result.alreadyMember, false);
    assert.equal(calls.joins.length, 1);
    const join = calls.joins[0];
    assert.equal(join?.conversationId, "conversation-1");
    assert.equal(join?.inviteId, "invite-1");
    assert.equal(join?.member.userId, "stranger-1");
    assert.equal(join?.member.role, "MEMBER");
    // The least-used palette entry, given #C2185B / #C77A2B / #1B8A55 are taken.
    assert.equal(join?.member.nameColor, "#8A46C7");
    // LAST_30D measured from the join instant, not from the group's creation.
    assert.deepEqual(join?.member.historyFromAt, new Date("2026-07-12T12:00:00.000Z"));
    assert.equal(join?.systemValue, "invite");
  });

  it("gives a member of a NONE-history group a floor at their own join instant", async () => {
    const { calls, deps } = dependencies(
      {},
      { conversation: conversationRow({ historyVisibility: "NONE" }) },
    );

    await joinGroupViaInvite("ABCDEFGH2345", "stranger-1", deps);

    assert.deepEqual(calls.joins[0]?.member.historyFromAt, NOW);
  });

  it("returns alreadyMember when a concurrent join won the roster lock", async () => {
    const { deps } = dependencies({ writeJoin: async () => false });

    const result = await joinGroupViaInvite("ABCDEFGH2345", "stranger-1", deps);

    assert.equal(result.alreadyMember, true);
  });

  it("refuses to join a 1:1 conversation even if a row somehow points at one", async () => {
    const { deps } = dependencies({}, { conversation: conversationRow({ type: "DM" }) });

    await assert.rejects(
      joinGroupViaInvite("ABCDEFGH2345", "stranger-1", deps),
      (error: unknown) => error instanceof ApiError && error.code === "NOT_A_GROUP",
    );
  });

  it("checks disabled before expiry, so a dead link never reveals it was real", async () => {
    const { deps } = dependencies(
      {},
      {
        invite: inviteRow({
          enabled: false,
          expiresAt: new Date(NOW.getTime() - 1),
          maxUses: 1,
          uses: 5,
        }),
      },
    );

    await assert.rejects(
      joinGroupViaInvite("ABCDEFGH2345", "stranger-1", deps),
      (error: unknown) => error instanceof ApiError && error.code === "INVITE_DISABLED",
    );
  });
});

/**
 * §F. Two guarantees the web test runner cannot reach through behaviour — it has
 * no database — but which a later edit could silently drop. Both are read out of
 * the source that carries them.
 */
describe("write guarantees", () => {
  it("claims `uses` atomically inside the join transaction", async () => {
    // Two simultaneous joins must both count. A read-modify-write
    // (`uses: invite.uses + 1`) loses one of them; only the database-side
    // increment does not, and only inside the same transaction as the
    // membership row.
    const source = await readFile(new URL("./group-invite-service.ts", import.meta.url), "utf8");
    const writeJoin = source.slice(source.indexOf("writeJoin: async ("));

    assert.match(writeJoin, /prisma\.\$transaction/);
    assert.match(writeJoin, /groupInvite\.updateMany\(\{\s*data: \{ uses: \{ increment: 1 \} \}/);
    // The counter must never be computed in application code.
    assert.equal(/uses:\s*[a-zA-Z]+\.uses\s*\+/.test(writeJoin), false);
  });

  it("re-checks both ceilings inside the transaction, not only in the snapshot", async () => {
    // `resolveJoinBlock` reads a snapshot: at 31 members, or on the last use of
    // a capped link, two concurrent joins both pass it. The transaction is what
    // rejects the loser — a member count taken there, and a conditional claim
    // that compares `uses` to `maxUses` in the database rather than in memory.
    const source = await readFile(new URL("./group-invite-service.ts", import.meta.url), "utf8");
    const writeJoin = source.slice(source.indexOf("writeJoin: async ("));

    assert.match(writeJoin, /tx\.dMParticipant\.findMany\(/);
    assert.match(writeJoin, /GROUP_DM_MAX_PARTICIPANTS/);
    assert.match(writeJoin, /prisma\.groupInvite\.fields\.maxUses/);
    assert.match(writeJoin, /claimed\.count === 0/);
  });

  it("serializes capacity checks per conversation and revalidates the invite claim", async () => {
    const source = await readFile(new URL("./group-invite-service.ts", import.meta.url), "utf8");
    const writeJoin = source.slice(source.indexOf("writeJoin: async ("));
    const lockIndex = writeJoin.indexOf("serializeGroupMembershipWrite");
    const countIndex = writeJoin.indexOf("tx.dMParticipant.findMany");

    assert.notEqual(lockIndex, -1);
    assert.ok(lockIndex < countIndex);
    assert.match(writeJoin, /code:\s*inviteCode/);
    assert.match(writeJoin, /enabled:\s*true/);
    assert.match(writeJoin, /existingParticipant/);
    assert.match(writeJoin, /return false/);
    assert.match(writeJoin, /const claimAt = new Date\(\)/);
    assert.match(writeJoin, /expiresAt:\s*\{\s*(?:gt|gte):\s*claimAt/);
  });

  it("keeps the invite code out of the create path's client input", async () => {
    // The code is minted server-side. A request-supplied code would let anybody
    // claim a vanity link — or somebody else's.
    const source = await readFile(new URL("./group-invite-service.ts", import.meta.url), "utf8");

    assert.match(source, /generateUniqueInviteCode\(/);
    assert.equal(/code:\s*(?:input|patch|body|request)\./.test(source), false);
  });
});
