import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveProfileTint } from "@wizards/types";

import type { ApiError } from "@/lib/api";
import {
  INVITE_CANDIDATE_PAGE_SIZE,
  compareInviteCandidateSortKeys,
  decodeInviteCandidateCursor,
  encodeInviteCandidateCursor,
  listInviteCandidates,
  matchesInviteCandidateQuery,
  normalizeInviteCandidateLimit,
  requireInviteCandidateContext,
  selectInviteCandidateIds,
  toInviteCandidateDTO,
  toInviteCandidateRelations,
  type InviteCandidateConversationRow,
  type InviteCandidateServiceDependencies,
  type InviteCandidateUserRow,
} from "@/lib/dm/invite-candidates";

/**
 * Ş10 — §16'nın aday süzme kuralı.
 *
 * Kuralların hepsi saf fonksiyonlarda; testlerin çoğu veritabanına hiç bakmadan
 * koşuyor. `listInviteCandidates` yalnız bu kuralların **sırasını** ve sayfalamayı
 * doğruluyor.
 */

const VIEWER = "user-1";
const CONVERSATION = "group-1";

function user(overrides: Partial<InviteCandidateUserRow> = {}): InviteCandidateUserRow {
  return {
    customStatus: null,
    displayName: "Can Öztürk",
    userId: "user-2",
    username: "can",
    ...overrides,
  };
}

function conversation(
  overrides: Partial<InviteCandidateConversationRow> = {},
): InviteCandidateConversationRow {
  return {
    id: CONVERSATION,
    participants: [
      { role: "OWNER", userId: VIEWER },
      { role: "MEMBER", userId: "user-9" },
    ],
    permAddMembers: "ALL",
    type: "GROUP_DM",
    ...overrides,
  };
}

function buildDependencies(
  overrides: Partial<InviteCandidateServiceDependencies> = {},
): InviteCandidateServiceDependencies {
  return {
    listClosedInviteUserIds: async () => [],
    loadConversation: async () => conversation(),
    loadRelations: async () => ({ blockedUserIds: [], friendUserIds: ["user-2"] }),
    loadUsers: async (userIds) => userIds.map((userId) => user({ userId })),
    readPresence: async () => new Map(),
    ...overrides,
  };
}

describe("aday havuzu — beş süzme kuralı", () => {
  it("arkadaş olmayan havuza hiç girmez", () => {
    assert.deepEqual(
      selectInviteCandidateIds({
        blockedUserIds: [],
        closedUserIds: [],
        friendUserIds: ["user-2"],
        memberUserIds: [],
        viewerId: VIEWER,
      }),
      ["user-2"],
    );
  });

  it("mevcut üye aday değildir", () => {
    assert.deepEqual(
      selectInviteCandidateIds({
        blockedUserIds: [],
        closedUserIds: [],
        friendUserIds: ["user-2", "user-3"],
        memberUserIds: ["user-3"],
        viewerId: VIEWER,
      }),
      ["user-2"],
    );
  });

  it("allowGroupInvites kapalı arkadaş aday değildir", () => {
    assert.deepEqual(
      selectInviteCandidateIds({
        blockedUserIds: [],
        closedUserIds: ["user-3"],
        friendUserIds: ["user-2", "user-3"],
        memberUserIds: [],
        viewerId: VIEWER,
      }),
      ["user-2"],
    );
  });

  it("engellenen ya da engelleyen aday değildir", () => {
    assert.deepEqual(
      selectInviteCandidateIds({
        blockedUserIds: ["user-2"],
        closedUserIds: [],
        friendUserIds: ["user-2", "user-3"],
        memberUserIds: [],
        viewerId: VIEWER,
      }),
      ["user-3"],
    );
  });

  it("viewer kendi listesinde çıkmaz", () => {
    assert.deepEqual(
      selectInviteCandidateIds({
        blockedUserIds: [],
        closedUserIds: [],
        friendUserIds: [VIEWER, "user-2"],
        memberUserIds: [],
        viewerId: VIEWER,
      }),
      ["user-2"],
    );
  });
});

describe("FriendRequest satırlarından ilişki türetme", () => {
  it("iki yönü de arkadaşlık sayar", () => {
    const relations = toInviteCandidateRelations(VIEWER, [
      { receiverId: "user-2", senderId: VIEWER, status: "ACCEPTED" },
      { receiverId: VIEWER, senderId: "user-3", status: "ACCEPTED" },
    ]);

    assert.deepEqual([...relations.friendUserIds].sort(), ["user-2", "user-3"]);
    assert.deepEqual(relations.blockedUserIds, []);
  });

  it("engel satırı arkadaşlık satırını yener", () => {
    const relations = toInviteCandidateRelations(VIEWER, [
      { receiverId: "user-2", senderId: VIEWER, status: "ACCEPTED" },
      { receiverId: VIEWER, senderId: "user-2", status: "BLOCKED" },
    ]);

    assert.deepEqual(relations.blockedUserIds, ["user-2"]);
    assert.deepEqual(
      selectInviteCandidateIds({
        blockedUserIds: relations.blockedUserIds,
        closedUserIds: [],
        friendUserIds: relations.friendUserIds,
        memberUserIds: [],
        viewerId: VIEWER,
      }),
      [],
    );
  });

  it("PENDING satırı ne arkadaş ne engel sayılır", () => {
    const relations = toInviteCandidateRelations(VIEWER, [
      { receiverId: "user-2", senderId: VIEWER, status: "PENDING" },
    ]);

    assert.deepEqual(relations.friendUserIds, []);
    assert.deepEqual(relations.blockedUserIds, []);
  });
});

describe("yetki kapısı", () => {
  it("olmayan konuşma 404", () => {
    assert.throws(
      () => requireInviteCandidateContext(null, VIEWER),
      (error: ApiError) => error.status === 404,
    );
  });

  it("katılımcı olmayan 403 — konuşmanın türünü öğrenmeden", () => {
    assert.throws(
      () => requireInviteCandidateContext(conversation({ type: "DM" }), "stranger"),
      (error: ApiError) => error.status === 403 && error.code === "FORBIDDEN",
    );
  });

  it("1:1 DM kimliği 400", () => {
    assert.throws(
      () => requireInviteCandidateContext(conversation({ type: "DM" }), VIEWER),
      (error: ApiError) => error.status === 400 && error.code === "NOT_A_GROUP",
    );
  });

  it("permAddMembers ADMINS + üye rolü 403", () => {
    assert.throws(
      () =>
        requireInviteCandidateContext(
          conversation({
            participants: [{ role: "MEMBER", userId: VIEWER }],
            permAddMembers: "ADMINS",
          }),
          VIEWER,
        ),
      (error: ApiError) => error.status === 403,
    );
  });

  it("permAddMembers ADMINS + yönetici geçer", () => {
    const context = requireInviteCandidateContext(
      conversation({
        participants: [{ role: "ADMIN", userId: VIEWER }],
        permAddMembers: "ADMINS",
      }),
      VIEWER,
    );

    assert.equal(context.viewerRole, "ADMIN");
  });

  it("permAddMembers ALL + üye rolü geçer", () => {
    const context = requireInviteCandidateContext(
      conversation({ participants: [{ role: "MEMBER", userId: VIEWER }] }),
      VIEWER,
    );

    assert.equal(context.viewerRole, "MEMBER");
  });
});

describe("arama", () => {
  const subject = user({ displayName: "İrem Şahin", userId: "user-5", username: "irem" });

  it("ada göre eşleşir", () => {
    assert.equal(matchesInviteCandidateQuery(subject, "şah"), true);
  });

  it("@ ile yazılan kullanıcı adına göre eşleşir", () => {
    assert.equal(matchesInviteCandidateQuery(subject, "@ire"), true);
  });

  it("türkçe büyük/küçük harf kuralıyla katlanır", () => {
    assert.equal(matchesInviteCandidateQuery(subject, "İREM"), true);
  });

  it("boş sorgu herkesi geçirir", () => {
    assert.equal(matchesInviteCandidateQuery(subject, "   "), true);
  });

  it("eşleşmeyen sorgu eler", () => {
    assert.equal(matchesInviteCandidateQuery(subject, "deniz"), false);
  });

  it("görünen ad yoksa kullanıcı adına düşer", () => {
    const handleOnly = user({ displayName: null, userId: "user-6", username: "burak" });

    assert.equal(matchesInviteCandidateQuery(handleOnly, "bura"), true);
  });
});

describe("imleç ve sayfa boyu", () => {
  it("imleç kodlanıp çözülür", () => {
    const key = { name: "Can Öztürk", userId: "user-2" };

    assert.deepEqual(decodeInviteCandidateCursor(encodeInviteCandidateCursor(key)), key);
  });

  it("bozuk imleç listenin başı olarak okunur", () => {
    assert.equal(decodeInviteCandidateCursor("bozuk-token"), null);
    assert.equal(decodeInviteCandidateCursor(null), null);
  });

  it("ad eşitse kimlik ayırır", () => {
    assert.ok(
      compareInviteCandidateSortKeys(
        { name: "Can", userId: "user-2" },
        { name: "Can", userId: "user-3" },
      ) < 0,
    );
  });

  it("limit sınırlanır", () => {
    assert.equal(normalizeInviteCandidateLimit(null), INVITE_CANDIDATE_PAGE_SIZE);
    assert.equal(normalizeInviteCandidateLimit(0), 1);
    assert.equal(normalizeInviteCandidateLimit(9999), 100);
    assert.equal(normalizeInviteCandidateLimit(10), 10);
  });
});

describe("DTO", () => {
  it("tint kimlikten türer ve ham renk taşımaz", () => {
    const dto = toInviteCandidateDTO(user({ userId: "user-7" }), undefined);

    assert.equal(dto.tint, resolveProfileTint("user-7"));
    assert.ok(!dto.tint.startsWith("#"));
  });

  it("baş harfler addan türer, durum metni presence'tan gelir", () => {
    const dto = toInviteCandidateDTO(user({ displayName: "Deniz Yıldız" }), {
      customStatus: "PUBG oynuyor · 2. sıra",
      status: "ONLINE",
    });

    assert.equal(dto.initials, "DY");
    assert.equal(dto.presence, "online");
    assert.equal(dto.statusText, "PUBG oynuyor · 2. sıra");
  });

  it("presence okunamayan aday çevrimdışı sayılır", () => {
    const dto = toInviteCandidateDTO(user(), undefined);

    assert.equal(dto.presence, "offline");
    assert.equal(dto.statusText, null);
  });
});

describe("listInviteCandidates", () => {
  it("mevcut üyeyi sunucuda eler ve zaten-üye sayısını döner", async () => {
    const page = await listInviteCandidates(
      VIEWER,
      CONVERSATION,
      {},
      buildDependencies({
        loadRelations: async () => ({ blockedUserIds: [], friendUserIds: ["user-2", "user-9"] }),
      }),
    );

    assert.deepEqual(
      page.items.map((item) => item.userId),
      ["user-2"],
    );
    assert.equal(page.alreadyMemberCount, 2);
  });

  it("allowGroupInvites kapalı arkadaşı sorguya hiç sokmaz", async () => {
    const asked: string[][] = [];
    const page = await listInviteCandidates(
      VIEWER,
      CONVERSATION,
      {},
      buildDependencies({
        listClosedInviteUserIds: async (userIds) => {
          asked.push([...userIds]);
          return ["user-3"];
        },
        loadRelations: async () => ({
          blockedUserIds: [],
          friendUserIds: ["user-2", "user-3", "user-9"],
        }),
      }),
    );

    // Zaten üye olan `user-9` gizlilik sorgusuna girmiyor: iki türlü de aday değil.
    assert.deepEqual(asked, [["user-2", "user-3"]]);
    assert.deepEqual(
      page.items.map((item) => item.userId),
      ["user-2"],
    );
  });

  it("yetkisiz viewer için hiçbir sorgu koşmaz", async () => {
    let loadedRelations = false;

    await assert.rejects(
      listInviteCandidates(
        VIEWER,
        CONVERSATION,
        {},
        buildDependencies({
          loadConversation: async () =>
            conversation({
              participants: [{ role: "MEMBER", userId: VIEWER }],
              permAddMembers: "ADMINS",
            }),
          loadRelations: async () => {
            loadedRelations = true;
            return { blockedUserIds: [], friendUserIds: [] };
          },
        }),
      ),
      (error: ApiError) => error.status === 403,
    );

    assert.equal(loadedRelations, false);
  });

  it("sayfayı keser, imleci verir ve imleçten devam eder", async () => {
    const names = ["Alice Nowak", "Burak Demir", "Can Öztürk"];
    const dependencies = buildDependencies({
      loadRelations: async () => ({
        blockedUserIds: [],
        friendUserIds: ["user-2", "user-3", "user-4"],
      }),
      loadUsers: async (userIds) =>
        userIds.map((userId, index) => user({ displayName: names[index] ?? userId, userId })),
    });

    const first = await listInviteCandidates(VIEWER, CONVERSATION, { limit: 2 }, dependencies);

    assert.deepEqual(
      first.items.map((item) => item.name),
      ["Alice Nowak", "Burak Demir"],
    );
    assert.ok(first.nextCursor);

    const second = await listInviteCandidates(
      VIEWER,
      CONVERSATION,
      { cursor: first.nextCursor, limit: 2 },
      dependencies,
    );

    assert.deepEqual(
      second.items.map((item) => item.name),
      ["Can Öztürk"],
    );
    assert.equal(second.nextCursor, null);
  });

  it("arama uca gider ve sayfayı daraltır", async () => {
    const page = await listInviteCandidates(
      VIEWER,
      CONVERSATION,
      { query: "@deniz" },
      buildDependencies({
        loadRelations: async () => ({ blockedUserIds: [], friendUserIds: ["user-2", "user-3"] }),
        loadUsers: async () => [
          user({ displayName: "Can Öztürk", userId: "user-2", username: "can" }),
          user({ displayName: "Deniz Yıldız", userId: "user-3", username: "deniz" }),
        ],
      }),
    );

    assert.deepEqual(
      page.items.map((item) => item.userId),
      ["user-3"],
    );
  });

  it("presence yalnız sayfadaki satırlar için okunur", async () => {
    const asked: string[][] = [];

    await listInviteCandidates(
      VIEWER,
      CONVERSATION,
      { limit: 1 },
      buildDependencies({
        loadRelations: async () => ({
          blockedUserIds: [],
          friendUserIds: ["user-2", "user-3", "user-4"],
        }),
        readPresence: async (_viewerId, subjects) => {
          asked.push(subjects.map((subject) => subject.userId));
          return new Map();
        },
      }),
    );

    assert.equal(asked.length, 1);
    assert.equal(asked[0]?.length, 1);
  });
});
