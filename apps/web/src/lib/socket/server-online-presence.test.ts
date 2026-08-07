import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addServerOnlineMember,
  buildServerOnlineKey,
  countServerOnlineMembers,
  removeServerOnlineMember,
} from "@/lib/socket/server-online-presence";

function buildRedis() {
  const sets = new Map<string, Set<string>>();
  const expiries: string[] = [];

  return {
    expiries,
    redis: {
      expire: async (key: string) => {
        expiries.push(key);
        return 1;
      },
      sadd: async (key: string, member: string) => {
        const set = sets.get(key) ?? new Set<string>();
        set.add(member);
        sets.set(key, set);
        return 1;
      },
      scard: async (key: string) => sets.get(key)?.size ?? 0,
      srem: async (key: string, member: string) => {
        sets.get(key)?.delete(member);
        return 1;
      },
    },
    sets,
  };
}

describe("server online presence", () => {
  it("names the key after the server", () => {
    assert.equal(buildServerOnlineKey("s1"), "server:s1:online");
  });

  it("counts each user once no matter how many sockets they hold", async () => {
    const { redis } = buildRedis();

    await addServerOnlineMember(redis as never, "s1", "u1");
    await addServerOnlineMember(redis as never, "s1", "u1");
    await addServerOnlineMember(redis as never, "s1", "u2");

    assert.equal(await countServerOnlineMembers(redis as never, "s1"), 2);
  });

  it("drops a user when the last socket leaves", async () => {
    const { redis } = buildRedis();

    await addServerOnlineMember(redis as never, "s1", "u1");
    await removeServerOnlineMember(redis as never, "s1", "u1");

    assert.equal(await countServerOnlineMembers(redis as never, "s1"), 0);
  });

  it("refreshes the expiry on every write so a stale set cannot linger", async () => {
    const { expiries, redis } = buildRedis();

    await addServerOnlineMember(redis as never, "s1", "u1");

    assert.deepEqual(expiries, ["server:s1:online"]);
  });

  it("returns zero for a server nobody is in", async () => {
    const { redis } = buildRedis();

    assert.equal(await countServerOnlineMembers(redis as never, "empty"), 0);
  });
});
