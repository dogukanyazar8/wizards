import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getMutualFriends,
  MUTUAL_FRIEND_DEFAULT_LIMIT,
  MUTUAL_FRIEND_PREVIEW_COUNT,
  type buildMutualFriendsWhere,
  type MutualFriendStore,
} from "./mutual-friends";

/**
 * Kesişimi PostgreSQL yapıyor, JS değil — o yüzden test edilen şey `where`
 * ağacının kendisi. Aşağıdaki değerlendirici tam olarak
 * `buildMutualFriendsWhere`'in ürettiği şekli yorumluyor: iki `connectedTo`
 * dalının `AND`'i, `deletedAt: null` ve `id.notIn`. Şekil değişirse test
 * kırılır, ki amaç da bu.
 */
type FriendEdge = { readonly peerId: string; readonly status: string };

type FakeUser = {
  readonly deletedAt: Date | null;
  readonly displayName: string | null;
  readonly id: string;
  readonly received: readonly FriendEdge[];
  readonly sent: readonly FriendEdge[];
  readonly username: string;
};

type ConnectedBranch = {
  friendRequestsSent?: { some: { receiverId: string; status: string } };
  friendRequestsReceived?: { some: { senderId: string; status: string } };
};

type MutualFriendsWhere = ReturnType<typeof buildMutualFriendsWhere>;

function matchesBranch(user: FakeUser, branch: ConnectedBranch): boolean {
  if (branch.friendRequestsSent) {
    const { receiverId, status } = branch.friendRequestsSent.some;
    return user.sent.some((edge) => edge.peerId === receiverId && edge.status === status);
  }

  const { senderId, status } = branch.friendRequestsReceived!.some;
  return user.received.some((edge) => edge.peerId === senderId && edge.status === status);
}

function matches(user: FakeUser, where: MutualFriendsWhere): boolean {
  if (where.deletedAt === null && user.deletedAt !== null) {
    return false;
  }

  if (where.id.notIn.includes(user.id)) {
    return false;
  }

  return where.AND.every((clause) =>
    clause.OR.some((branch) => matchesBranch(user, branch as ConnectedBranch)),
  );
}

function buildStore(users: readonly FakeUser[], calls: unknown[] = []) {
  const select = (where: MutualFriendsWhere) =>
    users
      .filter((user) => matches(user, where))
      .sort((left, right) => left.username.localeCompare(right.username));

  const store = {
    user: {
      count: async ({ where }: { where: MutualFriendsWhere }) => {
        calls.push({ op: "count" });
        return select(where).length;
      },
      findMany: async ({ take, where }: { take: number; where: MutualFriendsWhere }) => {
        calls.push({ op: "findMany", take });
        return select(where)
          .slice(0, take)
          .map((user) => ({
            displayName: user.displayName,
            id: user.id,
            username: user.username,
          }));
      },
    },
  } as unknown as MutualFriendStore;

  return { calls, store };
}

function user(
  id: string,
  username: string,
  edges: {
    deletedAt?: Date | null;
    received?: readonly FriendEdge[];
    sent?: readonly FriendEdge[];
  } = {},
): FakeUser {
  return {
    deletedAt: edges.deletedAt ?? null,
    displayName: null,
    id,
    received: edges.received ?? [],
    sent: edges.sent ?? [],
    username,
  };
}

const accepted = (peerId: string): FriendEdge => ({ peerId, status: "ACCEPTED" });

const GRAPH: readonly FakeUser[] = [
  // Her iki tarafla arkadaş; biriyle satır giden, diğeriyle gelen yönde açılmış.
  user("ali", "ali", { received: [accepted("viewer")], sent: [accepted("other")] }),
  // Yine iki taraflı, ama her iki satır da ters yönde: yön filtresi tutuyor mu.
  user("bora", "bora", { received: [accepted("viewer"), accepted("other")] }),
  // Yalnız görüntüleyenin arkadaşı.
  user("ceren", "ceren", { sent: [accepted("viewer")] }),
  // Yalnız karşı tarafın arkadaşı.
  user("deniz", "deniz", { sent: [accepted("other")] }),
  // İki tarafla da arkadaş ama hesabı silinmiş.
  user("elif", "elif", {
    deletedAt: new Date("2026-01-01T00:00:00.000Z"),
    sent: [accepted("viewer"), accepted("other")],
  }),
  // İstek karşı tarafta hâlâ beklemede — arkadaşlık değil.
  user("faruk", "faruk", {
    sent: [accepted("viewer"), { peerId: "other", status: "PENDING" }],
  }),
  user("gizem", "gizem", { sent: [accepted("viewer"), accepted("other")] }),
  user("hakan", "hakan", { sent: [accepted("viewer"), accepted("other")] }),
  user("irem", "irem", { sent: [accepted("viewer"), accepted("other")] }),
  // İki özne kendileri: birbirlerinin arkadaşı ve kesişimin dışında kalmalı.
  user("viewer", "viewer", { sent: [accepted("other")] }),
  user("other", "other", { received: [accepted("viewer")] }),
];

describe("getMutualFriends", () => {
  it("iki tarafın da arkadaşı olan hesapları döner, yön fark etmez", async () => {
    const { store } = buildStore(GRAPH);
    const result = await getMutualFriends("viewer", "other", 10, store);

    assert.deepEqual(
      result.users.map((entry) => entry.id),
      ["ali", "bora", "gizem", "hakan", "irem"],
    );
    assert.equal(result.total, 5);
  });

  it("iki özneyi kendi kesişimlerine koymaz", async () => {
    const { store } = buildStore(GRAPH);
    const result = await getMutualFriends("viewer", "other", 10, store);
    const ids = result.users.map((entry) => entry.id);

    assert.ok(!ids.includes("viewer"));
    assert.ok(!ids.includes("other"));
  });

  it("limiti uygular ama toplamı önizleme uzunluğundan okumaz", async () => {
    const { store } = buildStore(GRAPH);
    const result = await getMutualFriends("viewer", "other", 2, store);

    assert.deepEqual(
      result.users.map((entry) => entry.id),
      ["ali", "bora"],
    );
    // "ve N kişi daha" ancak gerçek toplam gelirse doğru olur.
    assert.equal(result.total, 5);
  });

  it("varsayılan limit panelin çizdiği satır sayısının bir fazlasıdır", async () => {
    const { calls, store } = buildStore(GRAPH);
    await getMutualFriends("viewer", "other", undefined, store);

    assert.equal(MUTUAL_FRIEND_DEFAULT_LIMIT, MUTUAL_FRIEND_PREVIEW_COUNT + 1);
    assert.deepEqual(
      calls.filter((call): call is { op: string; take: number } =>
        Boolean(call && typeof call === "object" && "take" in call),
      ),
      [{ op: "findMany", take: MUTUAL_FRIEND_DEFAULT_LIMIT }],
    );
  });

  it("boş kesişim boş dizi ve sıfır toplam döner", async () => {
    const { store } = buildStore([user("tek", "tek", { sent: [accepted("viewer")] })]);
    const result = await getMutualFriends("viewer", "other", 5, store);

    assert.deepEqual(result.users, []);
    assert.equal(result.total, 0);
  });

  it("aynı kişi için hiç sorgu açmaz", async () => {
    const { calls, store } = buildStore(GRAPH);
    const result = await getMutualFriends("viewer", "viewer", 5, store);

    assert.deepEqual(result, { total: 0, users: [] });
    assert.deepEqual(calls, []);
  });

  it("limit sıfırken satır çekmez, sayacı yine de okur", async () => {
    const { calls, store } = buildStore(GRAPH);
    const result = await getMutualFriends("viewer", "other", 0, store);

    assert.deepEqual(result.users, []);
    assert.equal(result.total, 5);
    assert.deepEqual(calls, [{ op: "count" }]);
  });
});
