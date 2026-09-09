import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BADGE_IDS, resolveProfileTint, type UserProfilePanelDTO } from "@wizards/types";

import {
  dmProfileRoute,
  mobileDmProfileRouteDependencies,
  webDmProfileRouteDependencies,
  type DmProfileRouteDependencies,
} from "./route-logic";

const PANEL: UserProfilePanelDTO = {
  badges: [
    { earnedAt: "2025-03-01T00:00:00.000Z", expiresAt: null, id: "verified", tier: 1 },
    { earnedAt: "2025-03-02T00:00:00.000Z", expiresAt: null, id: "earlyMember", tier: 1 },
  ],
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
      presence: "online",
      tint: resolveProfileTint("u-mert"),
    },
  ],
  mutualServers: [
    { id: "srv-1", initials: "WHS", name: "Whispr Topluluğu", onlineCount: 12, tint: "success" },
  ],
  name: "Selin Aksoy",
  notifyLevel: "ALL",
  presence: "online",
  privacy: { readReceipts: true, typingIndicator: false },
  statusText: "Tasarım Kritiği odasında",
  tint: resolveProfileTint("u-other"),
  userId: "u-other",
};

function request(url = "https://whispr.test/api/v1/dm/dm-1/profile") {
  return new Request(url);
}

function context(conversationId: string | undefined = "dm-1") {
  return { params: Promise.resolve({ conversationId } as { conversationId: string }) };
}

function buildDependencies(
  overrides: Partial<DmProfileRouteDependencies> = {},
): DmProfileRouteDependencies {
  return {
    authenticate: async () => "u-viewer",
    enforceRateLimit: async () => {},
    getProfile: async () => PANEL,
    rateLimitAction: "dm:conversation:read",
    ...overrides,
  };
}

/**
 * `ApiError`'a benzeyen ama o olmayan bir hata: `jsonError` şekle değil
 * `instanceof`'a bakıyor, o yüzden bu 500'e iner ve mesajı dışarı çıkmaz.
 */
class LookalikeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiError(message: string, status: number, code?: string) {
  const { ApiError } = await import("@/lib/api");
  return new ApiError(message, status, code);
}

describe("dmProfileRoute", () => {
  it("paneli tek gövdede döner ve gövdeyi şemadan geçirir", async () => {
    const seen: unknown[] = [];
    const response = await dmProfileRoute(
      request(),
      context(),
      buildDependencies({
        getProfile: async (userId, conversationId) => {
          seen.push({ conversationId, userId });
          return PANEL;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), PANEL);
    assert.deepEqual(seen, [{ conversationId: "dm-1", userId: "u-viewer" }]);
  });

  it("rozet paydası gövdede taşınmaz — katalog uzunluğu istemcide okunur", async () => {
    const response = await dmProfileRoute(request(), context(), buildDependencies());
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(BADGE_IDS.length, 16);
    assert.ok(!("badgeTotal" in body));
    assert.ok(Array.isArray(body.badges));
  });

  it("katılımcı olmayan çağırana 403 verir", async () => {
    const response = await dmProfileRoute(
      request(),
      context(),
      buildDependencies({
        getProfile: async () => {
          throw await apiError("You are not a participant of this conversation", 403, "FORBIDDEN");
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "FORBIDDEN",
      error: "You are not a participant of this conversation",
    });
  });

  it("grup id'siyle 400 verir", async () => {
    const response = await dmProfileRoute(
      request(),
      context("group-1"),
      buildDependencies({
        getProfile: async () => {
          throw await apiError("This conversation is a group", 400, "GROUP_CONVERSATION");
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "GROUP_CONVERSATION");
  });

  it("boş konuşma id'sini işe sokmadan reddeder", async () => {
    const calls: unknown[] = [];
    const response = await dmProfileRoute(
      request(),
      context(""),
      buildDependencies({
        getProfile: async () => {
          calls.push("read");
          return PANEL;
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(calls, []);
  });

  it("servis şemadan sapan bir alan koyarsa yanıt yayınlanmaz", async () => {
    const response = await dmProfileRoute(
      request(),
      context(),
      buildDependencies({
        getProfile: async () =>
          ({ ...PANEL, email: "selin@example.com" }) as unknown as UserProfilePanelDTO,
      }),
    );

    assert.notEqual(response.status, 200);
    assert.ok(!JSON.stringify(await response.json()).includes("selin@example.com"));
  });

  it("hız sınırı hatasını olduğu gibi geçirir", async () => {
    const response = await dmProfileRoute(
      request(),
      context(),
      buildDependencies({
        enforceRateLimit: async () => {
          throw await apiError("Too many requests", 429, "RATE_LIMITED");
        },
      }),
    );

    assert.equal(response.status, 429);
  });

  it("beklenmeyen bir hatayı 500'e indirir, ayrıntısını sızdırmaz", async () => {
    const response = await dmProfileRoute(
      request(),
      context(),
      buildDependencies({
        getProfile: async () => {
          throw new LookalikeApiError("connect ECONNREFUSED 127.0.0.1:5432", 500);
        },
      }),
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Internal server error" });
  });

  it("kimlik ve kova okumayı önce yapar, sonra veriyi okur", async () => {
    const order: string[] = [];
    await dmProfileRoute(
      request(),
      context(),
      buildDependencies({
        authenticate: async () => {
          order.push("auth");
          return "u-viewer";
        },
        enforceRateLimit: async (userId, action) => {
          order.push(`rate:${userId}:${action}`);
        },
        getProfile: async () => {
          order.push("read");
          return PANEL;
        },
      }),
    );

    assert.deepEqual(order, ["auth", "rate:u-viewer:dm:conversation:read", "read"]);
  });
});

describe("dmProfileRoute bağımlılık demetleri", () => {
  it("web kolu oturumdan, mobil kol istekten kimlik alır", () => {
    assert.equal(webDmProfileRouteDependencies.rateLimitAction, "dm:conversation:read");
    assert.equal(mobileDmProfileRouteDependencies.rateLimitAction, "mobile:dm:details");
    // K1: iki uç aynı gövdeyi okur; ayrışan tek şey kimlik ve kova.
    assert.equal(
      webDmProfileRouteDependencies.getProfile,
      mobileDmProfileRouteDependencies.getProfile,
    );
  });
});
