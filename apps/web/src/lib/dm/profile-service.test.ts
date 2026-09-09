import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveProfileTint } from "@wizards/types";

import {
  getDmProfilePanel,
  monthsBetween,
  resolveEffectiveMute,
  resolveMutualServerTint,
  PROFILE_MUTUAL_SERVER_LIMIT,
  type DmProfilePanelDependencies,
  type DmProfileStore,
} from "./profile-service";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const VIEWER = "u-viewer";
const OTHER = "u-other";

type Overrides = Partial<DmProfilePanelDependencies> & {
  conversation?: unknown;
  friendRequest?: { updatedAt: Date } | null;
  metVia?: { server: { name: string } } | null;
  settings?: { showReadReceipts: boolean; showTypingIndicator: boolean } | null;
};

const VIEWER_ROW = {
  muted: false,
  mutedUntil: null as Date | null,
  notifyLevel: "ALL" as const,
  user: {
    bio: "Ürün tasarımcısı · arayüz ve hareket.",
    customStatus: null as string | null,
    customStatusExpiresAt: null as Date | null,
    displayName: "Doğukan Yazar" as string | null,
    id: VIEWER,
    username: "dogukan",
  },
  userId: VIEWER,
};

const COUNTERPART_ROW = {
  muted: false,
  mutedUntil: null as Date | null,
  notifyLevel: "ALL" as const,
  user: {
    bio: "Kritik günleri çarşamba." as string | null,
    customStatus: "Tasarım Kritiği odasında" as string | null,
    customStatusExpiresAt: null as Date | null,
    displayName: "Selin Aksoy" as string | null,
    id: OTHER,
    username: "selin",
  },
  userId: OTHER,
};

function buildConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "dm-1",
    participants: [VIEWER_ROW, COUNTERPART_ROW],
    type: "DM" as const,
    ...overrides,
  };
}

function buildDependencies(overrides: Overrides = {}) {
  const calls = {
    badges: [] as unknown[],
    metVia: [] as unknown[],
    mutualFriends: [] as unknown[],
    mutualServers: [] as unknown[],
    presence: [] as unknown[],
    serverOnline: [] as unknown[],
  };

  const store = {
    dMConversation: {
      findUnique: async () =>
        overrides.conversation === undefined ? buildConversation() : overrides.conversation,
    },
    friendRequest: {
      findFirst: async () =>
        overrides.friendRequest === undefined
          ? { updatedAt: new Date("2025-02-14T09:00:00.000Z") }
          : overrides.friendRequest,
    },
    serverMember: {
      findFirst: async (args: unknown) => {
        calls.metVia.push(args);
        return overrides.metVia === undefined
          ? { server: { name: "Whispr Topluluğu" } }
          : overrides.metVia;
      },
    },
    userSettings: {
      findUnique: async () =>
        overrides.settings === undefined
          ? { showReadReceipts: true, showTypingIndicator: false }
          : overrides.settings,
    },
  } as unknown as DmProfileStore;

  const dependencies: DmProfilePanelDependencies = {
    getBlockStatus: async () => ({
      blocked: false,
      blockedByUserA: false,
      blockedByUserB: false,
    }),
    getMutualFriends: async (viewerId, otherUserId, limit) => {
      calls.mutualFriends.push({ limit, otherUserId, viewerId });
      return {
        total: 6,
        users: [
          { displayName: "Mert Kaya", id: "u-mert", username: "mert" },
          { displayName: null, id: "u-emre", username: "emre" },
        ],
      };
    },
    listMutualServers: async (viewerId, otherUserId, options) => {
      calls.mutualServers.push({ options, otherUserId, viewerId });
      return [
        {
          iconColor: "success" as const,
          iconUrl: null,
          id: "srv-1",
          memberCount: 40,
          name: "Whispr Topluluğu",
          shortName: "WHS",
        },
        {
          iconColor: null,
          iconUrl: null,
          id: "srv-2",
          memberCount: 9,
          name: "Product Team",
          shortName: null,
        },
      ];
    },
    now: () => NOW,
    readBadges: async (userId) => {
      calls.badges.push(userId);
      return [
        { earnedAt: "2025-03-01T00:00:00.000Z", expiresAt: null, id: "verified" as const, tier: 1 },
      ];
    },
    readPresence: async (viewerId, subjects) => {
      calls.presence.push({ subjects: subjects.map((subject) => subject.userId), viewerId });
      return new Map(
        subjects.map((subject) => [
          subject.userId,
          {
            customStatus: subject.customStatus,
            status: subject.userId === OTHER ? ("ONLINE" as const) : ("IDLE" as const),
          },
        ]),
      );
    },
    readServerOnlineCounts: async (serverIds) => {
      calls.serverOnline.push([...serverIds]);
      return new Map([
        ["srv-1", 12],
        ["srv-2", 4],
      ]);
    },
    store,
    ...overrides,
  };

  return { calls, dependencies };
}

describe("getDmProfilePanel", () => {
  it("her alanı kendi kaynağından toplar", async () => {
    const { calls, dependencies } = buildDependencies();
    const dto = await getDmProfilePanel(VIEWER, "dm-1", dependencies);

    assert.deepEqual(dto, {
      badges: [{ earnedAt: "2025-03-01T00:00:00.000Z", expiresAt: null, id: "verified", tier: 1 }],
      bio: "Kritik günleri çarşamba.",
      blocked: false,
      friendship: {
        durationMonths: 18,
        metViaServerName: "Whispr Topluluğu",
        since: "2025-02-14T09:00:00.000Z",
      },
      handle: "selin",
      initials: "SA",
      muted: false,
      mutedUntil: null,
      mutualFriendTotal: 6,
      mutualFriends: [
        {
          id: "u-mert",
          initials: "MK",
          name: "Mert Kaya",
          presence: "idle",
          tint: resolveProfileTint("u-mert"),
        },
        {
          id: "u-emre",
          initials: "E",
          name: "emre",
          presence: "idle",
          tint: resolveProfileTint("u-emre"),
        },
      ],
      mutualServers: [
        {
          id: "srv-1",
          initials: "WHS",
          name: "Whispr Topluluğu",
          onlineCount: 12,
          tint: "success",
        },
        { id: "srv-2", initials: "PRO", name: "Product Team", onlineCount: 4, tint: "neutral" },
      ],
      name: "Selin Aksoy",
      notifyLevel: "ALL",
      presence: "online",
      privacy: { readReceipts: true, typingIndicator: false },
      statusText: "Tasarım Kritiği odasında",
      tint: resolveProfileTint(OTHER),
      userId: OTHER,
    });

    // Rozetler karşı tarafın, görüntüleyenin değil.
    assert.deepEqual(calls.badges, [OTHER]);
    // Presence tek okumada: karşı taraf + ortak arkadaşlar. Satır başına ayrı
    // sorgu açılırsa bu liste bölünür ve test kırılır.
    assert.deepEqual(calls.presence, [{ subjects: [OTHER, "u-mert", "u-emre"], viewerId: VIEWER }]);
    assert.deepEqual(calls.serverOnline, [["srv-1", "srv-2"]]);
    assert.deepEqual(calls.mutualServers, [
      { options: { limit: PROFILE_MUTUAL_SERVER_LIMIT }, otherUserId: OTHER, viewerId: VIEWER },
    ]);
  });

  it("tinti kimlikten türetir, kaydedilmiş bir renkten değil", async () => {
    const { dependencies } = buildDependencies();
    const dto = await getDmProfilePanel(VIEWER, "dm-1", dependencies);

    assert.equal(dto.tint, resolveProfileTint(OTHER));
    assert.notEqual(dto.tint, "neutral");
  });

  it("konuşma yoksa 404 verir", async () => {
    const { dependencies } = buildDependencies({ conversation: null });

    await assert.rejects(getDmProfilePanel(VIEWER, "dm-1", dependencies), (error: unknown) => {
      assert.equal((error as { status: number }).status, 404);
      return true;
    });
  });

  it("katılımcı olmayan çağırana 403 verir", async () => {
    const { dependencies } = buildDependencies();

    await assert.rejects(
      getDmProfilePanel("u-stranger", "dm-1", dependencies),
      (error: unknown) => {
        assert.equal((error as { status: number }).status, 403);
        assert.equal((error as { code: string }).code, "FORBIDDEN");
        return true;
      },
    );
  });

  it("grup konuşmasında 400 verir — grup kolu ayrı uçtur", async () => {
    const { dependencies } = buildDependencies({
      conversation: buildConversation({ type: "GROUP_DM" }),
    });

    await assert.rejects(getDmProfilePanel(VIEWER, "dm-1", dependencies), (error: unknown) => {
      assert.equal((error as { status: number }).status, 400);
      assert.equal((error as { code: string }).code, "GROUP_CONVERSATION");
      return true;
    });
  });

  it("karşı taraf yoksa 404 verir", async () => {
    const { dependencies } = buildDependencies({
      conversation: buildConversation({ participants: [VIEWER_ROW] }),
    });

    await assert.rejects(getDmProfilePanel(VIEWER, "dm-1", dependencies), (error: unknown) => {
      assert.equal((error as { code: string }).code, "PARTICIPANT_NOT_FOUND");
      return true;
    });
  });

  it("arkadaş değilken tarih kartı düşer ve tanıştınız sorgusu hiç açılmaz", async () => {
    const { calls, dependencies } = buildDependencies({ friendRequest: null });
    const dto = await getDmProfilePanel(VIEWER, "dm-1", dependencies);

    assert.equal(dto.friendship, null);
    assert.deepEqual(calls.metVia, []);
  });

  it("ortak sunucu yokken tanıştınız cümlesi düşer, tarih kalır", async () => {
    const { dependencies } = buildDependencies({ metVia: null });
    const dto = await getDmProfilePanel(VIEWER, "dm-1", dependencies);

    assert.deepEqual(dto.friendship, {
      durationMonths: 18,
      metViaServerName: null,
      since: "2025-02-14T09:00:00.000Z",
    });
  });

  it("gizlilik tercihi satırı yoksa iki anahtar da açık okunur", async () => {
    const { dependencies } = buildDependencies({ settings: null });
    const dto = await getDmProfilePanel(VIEWER, "dm-1", dependencies);

    assert.deepEqual(dto.privacy, { readReceipts: true, typingIndicator: true });
  });

  it("süresi dolmuş sessizliği sessizlik saymaz ve tercihi geri açar", async () => {
    const { dependencies } = buildDependencies({
      conversation: buildConversation({
        participants: [
          {
            ...VIEWER_ROW,
            muted: true,
            mutedUntil: new Date("2026-08-27T11:00:00.000Z"),
            notifyLevel: "NONE" as const,
          },
          COUNTERPART_ROW,
        ],
      }),
    });
    const dto = await getDmProfilePanel(VIEWER, "dm-1", dependencies);

    assert.equal(dto.muted, false);
    assert.equal(dto.mutedUntil, null);
    assert.equal(dto.notifyLevel, "ALL");
  });

  it("süresi dolmamış sessizliği bitiş anıyla birlikte döner", async () => {
    const { dependencies } = buildDependencies({
      conversation: buildConversation({
        participants: [
          {
            ...VIEWER_ROW,
            muted: true,
            mutedUntil: new Date("2026-08-27T20:00:00.000Z"),
            notifyLevel: "NONE" as const,
          },
          COUNTERPART_ROW,
        ],
      }),
    });
    const dto = await getDmProfilePanel(VIEWER, "dm-1", dependencies);

    assert.equal(dto.muted, true);
    assert.equal(dto.mutedUntil, "2026-08-27T20:00:00.000Z");
    assert.equal(dto.notifyLevel, "NONE");
  });

  it("engelli çiftte kimlik kalır, kişisel ayrıntı kalmaz", async () => {
    const { dependencies } = buildDependencies({
      getBlockStatus: async () => ({
        blocked: true,
        blockedByUserA: true,
        blockedByUserB: false,
      }),
    });
    const dto = await getDmProfilePanel(VIEWER, "dm-1", dependencies);

    assert.equal(dto.blocked, true);
    assert.equal(dto.name, "Selin Aksoy");
    assert.equal(dto.handle, "selin");
    assert.equal(dto.bio, null);
    assert.equal(dto.statusText, null);
    assert.equal(dto.presence, "offline");
    assert.equal(dto.friendship, null);
    assert.deepEqual(dto.badges, []);
    assert.deepEqual(dto.mutualFriends, []);
    assert.equal(dto.mutualFriendTotal, 0);
    assert.deepEqual(dto.mutualServers, []);
    // Görüntüleyenin kendi tercihleri engelden etkilenmez.
    assert.deepEqual(dto.privacy, { readReceipts: true, typingIndicator: false });
  });

  it("süresi geçmiş özel durumu durum satırına yazmaz", async () => {
    const { dependencies } = buildDependencies({
      conversation: buildConversation({
        participants: [
          VIEWER_ROW,
          {
            ...COUNTERPART_ROW,
            user: {
              ...COUNTERPART_ROW.user,
              customStatusExpiresAt: new Date("2026-08-27T09:00:00.000Z"),
            },
          },
        ],
      }),
    });
    const dto = await getDmProfilePanel(VIEWER, "dm-1", dependencies);

    assert.equal(dto.statusText, null);
  });

  it("adı olmayan hesabı kullanıcı adıyla çizer", async () => {
    const { dependencies } = buildDependencies({
      conversation: buildConversation({
        participants: [
          VIEWER_ROW,
          { ...COUNTERPART_ROW, user: { ...COUNTERPART_ROW.user, displayName: "   " } },
        ],
      }),
    });
    const dto = await getDmProfilePanel(VIEWER, "dm-1", dependencies);

    assert.equal(dto.name, "selin");
    assert.equal(dto.initials, "S");
  });
});

describe("monthsBetween", () => {
  it("yıldönümünden önce ayı saymaz", () => {
    assert.equal(
      monthsBetween(new Date("2025-02-14T00:00:00.000Z"), new Date("2026-08-13T00:00:00.000Z")),
      17,
    );
    assert.equal(
      monthsBetween(new Date("2025-02-14T00:00:00.000Z"), new Date("2026-08-14T00:00:00.000Z")),
      18,
    );
  });

  it("gelecekteki bir tarihte negatife düşmez", () => {
    assert.equal(
      monthsBetween(new Date("2026-12-01T00:00:00.000Z"), new Date("2026-08-27T00:00:00.000Z")),
      0,
    );
  });
});

describe("resolveMutualServerTint", () => {
  it("sunucunun kendi ikon tonunu kullanır", () => {
    assert.equal(resolveMutualServerTint("warning"), "warning");
    assert.equal(resolveMutualServerTint("danger"), "danger");
  });

  it("paletin karşılığı olmayan tonları nötre indirir", () => {
    assert.equal(resolveMutualServerTint("info"), "primary");
    assert.equal(resolveMutualServerTint("accent2"), "neutral");
    assert.equal(resolveMutualServerTint(null), "neutral");
  });
});

describe("resolveEffectiveMute", () => {
  it("süresiz sessizliği olduğu gibi bırakır", () => {
    assert.deepEqual(
      resolveEffectiveMute({ muted: true, mutedUntil: null, notifyLevel: "NONE" }, NOW),
      { muted: true, mutedUntil: null, notifyLevel: "NONE" },
    );
  });

  it("sessiz olmayan satırın tercihini değiştirmez", () => {
    assert.deepEqual(
      resolveEffectiveMute({ muted: false, mutedUntil: null, notifyLevel: "MENTIONS" }, NOW),
      { muted: false, mutedUntil: null, notifyLevel: "MENTIONS" },
    );
  });
});
