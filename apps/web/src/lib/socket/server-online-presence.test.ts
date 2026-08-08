import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addServerOnlineMember,
  applyServerOnlinePresenceForSocket,
  buildServerOnlineKey,
  countServerOnlineMembers,
  countServerOnlineMembersBatch,
  isSocketEligibleForOnlinePresence,
  removeServerOnlineMember,
} from "@/lib/socket/server-online-presence";

function buildRedis(status: string = "ready") {
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
      status,
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

describe("server online presence write-path failure isolation", () => {
  it("addServerOnlineMember no-ops instead of throwing when redis is not ready", async () => {
    const { redis, sets } = buildRedis("connecting");

    await assert.doesNotReject(() => addServerOnlineMember(redis as never, "s1", "u1"));

    assert.equal(sets.get("server:s1:online"), undefined);
  });

  it("removeServerOnlineMember no-ops instead of throwing when redis is not ready", async () => {
    const { redis } = buildRedis("connecting");
    let sremCalls = 0;
    const countingRedis = {
      ...redis,
      srem: async (key: string, member: string) => {
        sremCalls += 1;
        return redis.srem(key, member);
      },
    };

    await assert.doesNotReject(() => removeServerOnlineMember(countingRedis as never, "s1", "u1"));

    assert.equal(sremCalls, 0);
  });

  it("addServerOnlineMember swallows a write failure instead of throwing", async () => {
    const { redis } = buildRedis();
    const failingRedis = {
      ...redis,
      sadd: async () => {
        throw new Error("ECONNRESET");
      },
    };

    // Simulates a command that fails *after* `status` already read "ready"
    // (a mid-flight timeout or connection reset) -- the write is derived
    // state, so this must degrade the count rather than break the caller.
    await assert.doesNotReject(() => addServerOnlineMember(failingRedis as never, "s1", "u1"));
  });

  it("addServerOnlineMember swallows an expire failure that lands after a successful sadd", async () => {
    const { redis, sets } = buildRedis();
    const failingRedis = {
      ...redis,
      expire: async () => {
        throw new Error("ECONNRESET");
      },
    };

    await assert.doesNotReject(() => addServerOnlineMember(failingRedis as never, "s1", "u1"));
    // The sadd before the failing expire still lands -- a missed TTL refresh
    // degrades cleanup, not correctness.
    assert.deepEqual([...(sets.get("server:s1:online") ?? [])], ["u1"]);
  });

  it("removeServerOnlineMember swallows a write failure instead of throwing", async () => {
    const { redis } = buildRedis();
    const failingRedis = {
      ...redis,
      srem: async () => {
        throw new Error("ECONNRESET");
      },
    };

    await assert.doesNotReject(() => removeServerOnlineMember(failingRedis as never, "s1", "u1"));
  });
});

describe("isSocketEligibleForOnlinePresence", () => {
  it("is eligible when connected and presence is not OFFLINE", () => {
    assert.equal(
      isSocketEligibleForOnlinePresence({ connected: true, data: { presenceStatus: "ONLINE" } }),
      true,
    );
    assert.equal(
      isSocketEligibleForOnlinePresence({ connected: true, data: { presenceStatus: "DND" } }),
      true,
    );
  });

  it("defaults an unset presenceStatus to eligible, matching the connect-time OFFLINE default not having been read yet", () => {
    // Callers (joinServerRoomsForUser) key off socket.data.presenceStatus,
    // which server.ts's assignSocketUserData always sets to "OFFLINE" before
    // connection handlers run -- but the predicate itself must not assume
    // that has happened, so an unset field is not treated as OFFLINE.
    assert.equal(isSocketEligibleForOnlinePresence({ connected: true, data: {} }), true);
  });

  it("is not eligible once presence is OFFLINE, regardless of connection state", () => {
    assert.equal(
      isSocketEligibleForOnlinePresence({ connected: true, data: { presenceStatus: "OFFLINE" } }),
      false,
    );
  });

  it("is not eligible once disconnected, regardless of presence status", () => {
    assert.equal(
      isSocketEligibleForOnlinePresence({ connected: false, data: { presenceStatus: "ONLINE" } }),
      false,
    );
  });

  it("treats an unset connected flag as connected", () => {
    // The minimal test-double sockets used for joinServerRoomsForUser's
    // existing coverage don't set `connected` at all.
    assert.equal(isSocketEligibleForOnlinePresence({ data: { presenceStatus: "ONLINE" } }), true);
  });

  it("is not eligible when both disconnected and OFFLINE", () => {
    assert.equal(
      isSocketEligibleForOnlinePresence({ connected: false, data: { presenceStatus: "OFFLINE" } }),
      false,
    );
  });
});

describe("applyServerOnlinePresenceForSocket", () => {
  it("adds the user to every server room the socket is in", async () => {
    const { redis, sets } = buildRedis();
    const socket = {
      connected: true,
      data: { onlineServerIds: ["s1", "s2"], presenceStatus: "ONLINE" },
    };

    await applyServerOnlinePresenceForSocket(redis as never, socket, "u1");

    assert.deepEqual([...(sets.get("server:s1:online") ?? [])], ["u1"]);
    assert.deepEqual([...(sets.get("server:s2:online") ?? [])], ["u1"]);
  });

  it("removes instead of adding when presence resolved to OFFLINE", async () => {
    // The invisible/DND-to-invisible case on the presence chain: such clients
    // never send a corrective `presence:activity`, so an add here would stick.
    const { redis, sets } = buildRedis();
    sets.set("server:s1:online", new Set(["u1", "u2"]));
    const socket = {
      connected: true,
      data: { onlineServerIds: ["s1"], presenceStatus: "OFFLINE" },
    };

    await applyServerOnlinePresenceForSocket(redis as never, socket, "u1");

    assert.deepEqual([...(sets.get("server:s1:online") ?? [])], ["u2"]);
  });

  it("removes rather than resurrects when the socket already disconnected", async () => {
    // `initializePresence` is fire-and-forget: the disconnect handler can have
    // already run (and removed nothing, or everything) by the time the
    // presence lookup resolves. Adding then would be a permanent ghost.
    const { redis, sets } = buildRedis();
    sets.set("server:s1:online", new Set(["u1"]));
    const socket = {
      connected: false,
      data: { onlineServerIds: ["s1"], presenceStatus: "ONLINE" },
    };

    await applyServerOnlinePresenceForSocket(redis as never, socket, "u1");

    assert.equal(await countServerOnlineMembers(redis as never, "s1"), 0);
  });

  it("reverses the add when eligibility flips while the writes are in flight", async () => {
    const { redis, sets } = buildRedis();
    const socket = {
      connected: true,
      data: { onlineServerIds: ["s1", "s2"], presenceStatus: "ONLINE" },
    };
    const racingRedis = {
      ...redis,
      sadd: async (key: string, member: string) => {
        socket.connected = false;
        return redis.sadd(key, member);
      },
    };

    await applyServerOnlinePresenceForSocket(racingRedis as never, socket, "u1");

    assert.deepEqual([...(sets.get("server:s1:online") ?? [])], []);
    assert.deepEqual([...(sets.get("server:s2:online") ?? [])], []);
  });

  it("reads the server list at write time, so a concurrent kick's pruning holds", async () => {
    // `detachUserFromServerSocketRoom` drops the kicked server from
    // `onlineServerIds`; a writer holding a stale copy would re-add it.
    const { redis, sets } = buildRedis();
    const socket = {
      connected: true,
      data: { onlineServerIds: ["s1", "s2"], presenceStatus: "ONLINE" },
    };
    socket.data.onlineServerIds = ["s1"];

    await applyServerOnlinePresenceForSocket(redis as never, socket, "u1");

    assert.deepEqual([...(sets.get("server:s1:online") ?? [])], ["u1"]);
    assert.equal(sets.get("server:s2:online"), undefined);
  });

  it("issues no command at all when the socket is in no server rooms", async () => {
    const { redis } = buildRedis();
    let commands = 0;
    const countingRedis = {
      ...redis,
      sadd: async (key: string, member: string) => {
        commands += 1;
        return redis.sadd(key, member);
      },
      srem: async (key: string, member: string) => {
        commands += 1;
        return redis.srem(key, member);
      },
    };

    await applyServerOnlinePresenceForSocket(
      countingRedis as never,
      {
        connected: true,
        data: { presenceStatus: "ONLINE" },
      },
      "u1",
    );

    assert.equal(commands, 0);
  });
});

/**
 * A separate builder rather than extending `buildRedis` above: the batch
 * primitive's `pipeline()` is a distinct capability from the plain
 * single-key client every other test in this file relies on, and keeping it
 * in its own helper means those existing tests' fixture cannot be disturbed
 * by anything added here.
 */
function buildBatchRedis(status: string = "ready") {
  const sets = new Map<string, Set<string>>();

  return {
    redis: {
      pipeline() {
        const keys: string[] = [];
        const chain = {
          exec: async () =>
            keys.map((key) => [null, sets.get(key)?.size ?? 0] as [Error | null, unknown]),
          scard(key: string) {
            keys.push(key);
            return chain;
          },
        };
        return chain;
      },
      // Only needed so the parity test below can call the single-key
      // primitive against this same fixture; countServerOnlineMembersBatch
      // itself never reads this.
      scard: async (key: string) => sets.get(key)?.size ?? 0,
      status,
    },
    sets,
  };
}

describe("countServerOnlineMembersBatch", () => {
  it("reads every requested server's count from a single pipeline", async () => {
    const { redis, sets } = buildBatchRedis();
    sets.set("server:s1:online", new Set(["u1", "u2"]));
    sets.set("server:s2:online", new Set(["u1"]));

    const counts = await countServerOnlineMembersBatch(redis as never, ["s1", "s2", "empty"]);

    assert.deepEqual(Object.fromEntries(counts), { empty: 0, s1: 2, s2: 1 });
  });

  it("agrees with the single-server primitive reading the exact same set", async () => {
    // Binding decision 5: the discovery list and the single-server profile
    // card must never disagree about the same server's online count. Both
    // read `server:<id>:online` through `buildServerOnlineKey`, so proving
    // this equality here at the source is a stronger guarantee than
    // re-deriving it downstream in each consumer's own tests.
    const { redis, sets } = buildBatchRedis();
    sets.set("server:s1:online", new Set(["u1", "u2", "u3"]));

    const single = await countServerOnlineMembers(redis as never, "s1");
    const batch = await countServerOnlineMembersBatch(redis as never, ["s1"]);

    assert.equal(single, 3);
    assert.equal(batch.get("s1"), single);
  });

  it("returns an empty map without touching redis when no ids are requested", async () => {
    const { redis } = buildBatchRedis();
    let pipelineCalls = 0;
    const countingRedis = {
      ...redis,
      pipeline: () => {
        pipelineCalls += 1;
        return redis.pipeline();
      },
    };

    const counts = await countServerOnlineMembersBatch(countingRedis as never, []);

    assert.deepEqual([...counts.entries()], []);
    assert.equal(pipelineCalls, 0);
  });

  it("degrades every count to zero instead of throwing when redis is not ready", async () => {
    const { redis } = buildBatchRedis("connecting");

    const counts = await countServerOnlineMembersBatch(redis as never, ["s1", "s2"]);

    assert.deepEqual(Object.fromEntries(counts), { s1: 0, s2: 0 });
  });

  it("degrades every count to zero instead of throwing when the pipeline rejects", async () => {
    const { redis } = buildBatchRedis();
    const failingRedis = {
      ...redis,
      pipeline: () => ({
        exec: async () => {
          throw new Error("ECONNRESET");
        },
        scard() {
          return this;
        },
      }),
    };

    await assert.doesNotReject(async () => {
      const counts = await countServerOnlineMembersBatch(failingRedis as never, ["s1", "s2"]);
      assert.deepEqual(Object.fromEntries(counts), { s1: 0, s2: 0 });
    });
  });
});
