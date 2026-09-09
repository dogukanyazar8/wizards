import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InviteCandidatePage } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { API_RATE_LIMITS } from "@/lib/api-rate-limit";

import {
  groupInviteCandidatesRoute,
  inviteCandidateDefaults,
  type InviteCandidateRouteDependencies,
} from "./route-logic";

/**
 * Ş10 — §16'nın aday ucu. Sıra kural 8'in sırası: kimlik → hız sınırı → zod → yetki → iş.
 * Yetki servisin içinde (`requireInviteCandidateContext`); burada onun **çağrıldığı**
 * ve hatasının statüsünü koruduğu doğrulanıyor.
 */

const page: InviteCandidatePage = {
  alreadyMemberCount: 5,
  items: [
    {
      initials: "CÖ",
      name: "Can Öztürk",
      presence: "online",
      statusText: null,
      tint: "primary",
      userId: "user-2",
    },
  ],
  nextCursor: null,
};

function buildDependencies(
  overrides: Partial<InviteCandidateRouteDependencies> = {},
): InviteCandidateRouteDependencies {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => {},
    listCandidates: async () => page,
    rateLimits: { read: "dm:group:candidates" },
    ...overrides,
  };
}

function request(url = "https://whispr.test/api/v1/dm/groups/group-1/candidates"): Request {
  return new Request(url);
}

describe("aday ucu — sıra", () => {
  it("kimliği hız sınırından önce ister", async () => {
    const order: string[] = [];

    await groupInviteCandidatesRoute(
      request(),
      "group-1",
      buildDependencies({
        authenticate: async () => {
          order.push("auth");
          return "user-1";
        },
        enforceRateLimit: async () => {
          order.push("rate");
        },
        listCandidates: async () => {
          order.push("work");
          return page;
        },
      }),
    );

    assert.deepEqual(order, ["auth", "rate", "work"]);
  });

  it("kimliksiz istekte iş hiç koşmaz", async () => {
    let called = false;
    const response = await groupInviteCandidatesRoute(
      request(),
      "group-1",
      buildDependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        listCandidates: async () => {
          called = true;
          return page;
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(called, false);
  });

  it("kendi kovasını harcar, panelinkini değil", () => {
    assert.ok(inviteCandidateDefaults.rateLimits.read in API_RATE_LIMITS);
    assert.equal(inviteCandidateDefaults.rateLimits.read, "dm:group:candidates");

    // Aday listesi arama yüzeyidir ve her tuşta ateşlenir; panel okumasının bütçesini
    // paylaşsaydı yazarken profil panelini kendi kendine 429'a düşürebilirdi.
    assert.ok(
      API_RATE_LIMITS["dm:group:candidates"].limit < API_RATE_LIMITS["dm:group:read"].limit,
    );
  });
});

describe("aday ucu — sorgu dizesi", () => {
  it("imleç, limit ve aramayı servise geçirir", async () => {
    const seen: unknown[] = [];
    const response = await groupInviteCandidatesRoute(
      request(
        "https://whispr.test/api/v1/dm/groups/group-1/candidates?cursor=abc&limit=10&query=%20can%20",
      ),
      "group-1",
      buildDependencies({
        listCandidates: async (_viewerId, _conversationId, options) => {
          seen.push(options);
          return page;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), page);
    assert.deepEqual(seen, [{ cursor: "abc", limit: 10, query: "can" }]);
  });

  it("boş sorgu dizesinde üçü de null", async () => {
    const seen: unknown[] = [];

    await groupInviteCandidatesRoute(
      request(),
      "group-1",
      buildDependencies({
        listCandidates: async (_viewerId, _conversationId, options) => {
          seen.push(options);
          return page;
        },
      }),
    );

    assert.deepEqual(seen, [{ cursor: null, limit: null, query: null }]);
  });

  it("boş konuşma kimliğini servise hiç göndermez", async () => {
    let called = false;
    const response = await groupInviteCandidatesRoute(
      request(),
      "   ",
      buildDependencies({
        listCandidates: async () => {
          called = true;
          return page;
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(called, false);
  });
});

describe("aday ucu — yetki", () => {
  it("katılımcı olmayan 403", async () => {
    const response = await groupInviteCandidatesRoute(
      request(),
      "group-1",
      buildDependencies({
        listCandidates: async () => {
          throw new ApiError("You are not a participant in this conversation", 403, "FORBIDDEN");
        },
      }),
    );

    assert.equal(response.status, 403);
  });

  it("ADMINS kuralında üye rolü 403", async () => {
    const response = await groupInviteCandidatesRoute(
      request(),
      "group-1",
      buildDependencies({
        listCandidates: async () => {
          throw new ApiError("You do not have permission to do this", 403, "FORBIDDEN");
        },
      }),
    );

    assert.equal(response.status, 403);
  });

  it("olmayan konuşma 404", async () => {
    const response = await groupInviteCandidatesRoute(
      request(),
      "group-1",
      buildDependencies({
        listCandidates: async () => {
          throw new ApiError("Conversation not found", 404, "NOT_FOUND");
        },
      }),
    );

    assert.equal(response.status, 404);
  });
});
