import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FRIEND_SUGGESTION_MAX } from "@wizards/types";
import { listFriendSuggestions, type FriendSuggestionsDependencies } from "./suggestions-service";

type Candidate = Awaited<ReturnType<FriendSuggestionsDependencies["loadCandidates"]>>[number];

function candidate(id: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    avatarUrl: null,
    displayName: `Kişi ${id}`,
    id,
    memberships: [{ server: { id: "server-1", memberCount: 10, name: "Whispr Topluluğu" } }],
    username: id,
    ...overrides,
  };
}

type Calls = { candidateQueries: unknown[] };

function buildDependencies(overrides: Partial<FriendSuggestionsDependencies> = {}): {
  calls: Calls;
  dependencies: FriendSuggestionsDependencies;
} {
  const calls: Calls = { candidateQueries: [] };

  const dependencies: FriendSuggestionsDependencies = {
    loadCandidates: async (input) => {
      calls.candidateQueries.push(input);
      return [candidate("user-2")];
    },
    loadExcludedUserIds: async () => [],
    loadMutualFriendCounts: async () => new Map(),
    loadViewerServerIds: async () => ["server-1"],
    ...overrides,
  };

  return { calls, dependencies };
}

describe("öneri kapsamı", () => {
  it("ortak sunucusu olmayan için hiç sorgu açmaz", async () => {
    const { calls, dependencies } = buildDependencies({ loadViewerServerIds: async () => [] });

    assert.deepEqual(await listFriendSuggestions("user-1", dependencies), []);
    assert.deepEqual(calls.candidateQueries, []);
  });

  it("elenmiş kimlikleri aday sorgusuna taşır", async () => {
    // Eleme sunucu tarafında: istemcinin süzdüğü bir liste, engellenen birinin
    // adını yine de ağdan geçirirdi.
    const { calls, dependencies } = buildDependencies({
      loadExcludedUserIds: async () => ["user-1", "blocked-1", "pending-1"],
    });

    await listFriendSuggestions("user-1", dependencies);

    assert.deepEqual((calls.candidateQueries[0] as { excludedUserIds: string[] }).excludedUserIds, [
      "user-1",
      "blocked-1",
      "pending-1",
    ]);
  });

  it("ortak profile visibility policy'sini aday sorgusuna taşır", async () => {
    const { calls, dependencies } = buildDependencies();

    await listFriendSuggestions("user-1", dependencies);

    const query = calls.candidateQueries[0] as Record<string, unknown>;
    const serialized = JSON.stringify(query.profileVisibilityWhere) ?? "";
    assert.match(serialized, /profileVisibility.*EVERYONE/);
    assert.match(serialized, /profileVisibility.*FRIENDS/);
    assert.match(serialized, /BLOCKED/);
  });

  it("presence alanı hiç taşımaz", async () => {
    const [suggestion] = await listFriendSuggestions("user-1", buildDependencies().dependencies);

    assert.ok(suggestion);
    assert.equal("presence" in suggestion, false);
    assert.equal("status" in suggestion, false);
  });
});

describe("öneri sıralaması", () => {
  it("ortak arkadaş sayısına, sonra ada göre sıralar", async () => {
    const { dependencies } = buildDependencies({
      loadCandidates: async () => [
        candidate("user-2", { displayName: "Zeynep" }),
        candidate("user-3", { displayName: "Ahmet" }),
        candidate("user-4", { displayName: "Berk" }),
      ],
      loadMutualFriendCounts: async () =>
        new Map([
          ["user-2", 5],
          ["user-3", 1],
          ["user-4", 1],
        ]),
    });

    const suggestions = await listFriendSuggestions("user-1", dependencies);

    assert.deepEqual(
      suggestions.map((suggestion) => suggestion.name),
      ["Zeynep", "Ahmet", "Berk"],
    );
  });

  it("tavanı aşmaz", async () => {
    const { dependencies } = buildDependencies({
      loadCandidates: async () =>
        Array.from({ length: FRIEND_SUGGESTION_MAX + 5 }, (_unused, index) =>
          candidate(`user-${index + 2}`),
        ),
    });

    const suggestions = await listFriendSuggestions("user-1", dependencies);

    assert.equal(suggestions.length, FRIEND_SUGGESTION_MAX);
  });
});

describe("hangi sunucudan geldiği", () => {
  it("en kalabalık ortak sunucuyu seçer", async () => {
    const { dependencies } = buildDependencies({
      loadCandidates: async () => [
        candidate("user-2", {
          memberships: [
            { server: { id: "server-1", memberCount: 4, name: "Oyun Kulübü" } },
            { server: { id: "server-2", memberCount: 40, name: "Whispr Topluluğu" } },
          ],
        }),
      ],
    });

    const [suggestion] = await listFriendSuggestions("user-1", dependencies);

    assert.equal(suggestion?.viaServerName, "Whispr Topluluğu");
  });

  it("eşit üyeli sunucularda kimliğe göre kararlı seçer", async () => {
    // İki istek "hangi sunucudan geldi" sorusuna farklı cevap vermemeli.
    const memberships = [
      { server: { id: "server-b", memberCount: 10, name: "B" } },
      { server: { id: "server-a", memberCount: 10, name: "A" } },
    ];
    const { dependencies } = buildDependencies({
      loadCandidates: async () => [candidate("user-2", { memberships })],
    });

    const first = await listFriendSuggestions("user-1", dependencies);
    const second = await listFriendSuggestions("user-1", dependencies);

    assert.equal(first[0]?.viaServerName, "A");
    assert.equal(second[0]?.viaServerName, "A");
  });
});

describe("baş harfler", () => {
  it("iki kelimeden iki harf alır", async () => {
    const { dependencies } = buildDependencies({
      loadCandidates: async () => [candidate("user-2", { displayName: "Selin Aksoy" })],
    });

    assert.equal((await listFriendSuggestions("user-1", dependencies))[0]?.initials, "SA");
  });

  it("görünen ad yoksa kullanıcı adına düşer", async () => {
    const { dependencies } = buildDependencies({
      loadCandidates: async () => [candidate("user-2", { displayName: null, username: "selin" })],
    });

    const [suggestion] = await listFriendSuggestions("user-1", dependencies);

    assert.equal(suggestion?.name, "selin");
    assert.equal(suggestion?.initials, "S");
  });

  it("Türkçe büyütmeyi doğru yapar", async () => {
    // `i` İngilizce kuralla `I` olurdu; Türkçede `İ`.
    const { dependencies } = buildDependencies({
      loadCandidates: async () => [candidate("user-2", { displayName: "irem Çelik" })],
    });

    assert.equal((await listFriendSuggestions("user-1", dependencies))[0]?.initials, "İÇ");
  });
});
