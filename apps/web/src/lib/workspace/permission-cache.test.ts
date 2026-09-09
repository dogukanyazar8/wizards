import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType } from "@wizards/db";
import {
  type CachedChannelPermissionSnapshot,
  publishPermissionCacheRevision,
  readCachedChannelPermissionSnapshot,
  readCachedVisibleChannelIdsBatch,
  readCachedVisibleChannelIdsByServerBatch,
  setPermissionCacheRedisForTest,
  writeCachedChannelPermissionSnapshot,
  writeCachedVisibleChannelIdsBatch,
} from "./permission-cache";
import { PermissionBits } from "./permissions";

class MemoryRedis {
  private readonly values = new Map<string, string>();
  mgetCalls = 0;
  failNextPipelineCommand = false;
  failNextEval = false;

  setRaw(key: string, value: string) {
    this.values.set(key, value);
  }

  async mget(...keys: string[]) {
    this.mgetCalls += 1;
    return keys.map((key) => this.values.get(key) ?? null);
  }

  async eval(_script: string, keyCount: number, ...args: Array<number | string>) {
    if (this.failNextEval) {
      this.failNextEval = false;
      throw new Error("simulated Redis eval failure");
    }
    const keys = args.slice(0, keyCount).map(String);
    const values = args.slice(keyCount).map(String);
    if (keyCount === 1) {
      this.values.set(keys[0]!, values[0]!);
      return 1;
    }
    const [cacheKey, serverKey, memberKey] = keys;
    const [payload, , serverVersion, memberVersion] = values;
    if (
      BigInt(this.values.get(serverKey!) ?? "0") > BigInt(serverVersion!) ||
      BigInt(this.values.get(memberKey!) ?? "0") > BigInt(memberVersion!)
    ) {
      return 0;
    }
    this.values.set(serverKey!, serverVersion!);
    this.values.set(memberKey!, memberVersion!);
    this.values.set(cacheKey!, payload!);
    return 1;
  }

  pipeline() {
    const operations: Array<() => void> = [];
    const pipeline = {
      exec: async () => {
        if (this.failNextPipelineCommand) {
          this.failNextPipelineCommand = false;
          return [[new Error("simulated pipeline command failure"), null]];
        }
        for (const operation of operations) {
          operation();
        }
        return [];
      },
      expire: () => pipeline,
      eval: (_script: string, keyCount: number, ...args: Array<number | string>) => {
        operations.push(() => {
          void this.eval(_script, keyCount, ...args);
        });
        return pipeline;
      },
      incr: (key: string) => {
        operations.push(() => {
          const current = Number.parseInt(this.values.get(key) ?? "0", 10);
          this.values.set(key, String(current + 1));
        });
        return pipeline;
      },
      set: (key: string, value: string) => {
        operations.push(() => {
          this.values.set(key, value);
        });
        return pipeline;
      },
    };

    return pipeline;
  }
}

function restoreEnv(
  name: "PERMISSION_CACHE_DISABLED" | "PERMISSION_CACHE_ENABLED",
  value?: string,
) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function withPermissionCacheEnabled(run: () => Promise<void>) {
  const originalDisabled = process.env.PERMISSION_CACHE_DISABLED;
  const originalEnabled = process.env.PERMISSION_CACHE_ENABLED;
  process.env.PERMISSION_CACHE_ENABLED = "true";
  delete process.env.PERMISSION_CACHE_DISABLED;
  setPermissionCacheRedisForTest(new MemoryRedis());

  try {
    await run();
  } finally {
    setPermissionCacheRedisForTest(null);
    restoreEnv("PERMISSION_CACHE_DISABLED", originalDisabled);
    restoreEnv("PERMISSION_CACHE_ENABLED", originalEnabled);
  }
}

function createSnapshot(): CachedChannelPermissionSnapshot {
  return {
    channel: {
      id: "channel-1",
      bitrate: 64_000,
      locked: false,
      name: "general",
      rtcRegion: null,
      slowModeDelay: 0,
      server: {
        features: ["GIFS_ENABLED"],
        messageCharacterLimit: 2000,
        slowModeDelay: 0,
      },
      serverId: "server-1",
      type: ChannelType.TEXT,
      userLimit: 0,
      videoQualityMode: "AUTO",
    },
    context: {
      memberId: "member-1",
      ownerId: "owner-1",
      roles: [
        {
          id: "everyone",
          isDefault: true,
          name: "@everyone",
          permissions: PermissionBits.VIEW_CHANNEL,
        },
      ],
      userId: "user-1",
    },
    explicitAllowPermissions: 0n,
    permissions: PermissionBits.VIEW_CHANNEL,
  };
}

describe("workspace permission cache", () => {
  it("treats channel permission snapshots as stale after version invalidation", async () => {
    await withPermissionCacheEnabled(async () => {
      await writeCachedChannelPermissionSnapshot({
        channelId: "channel-1",
        revisions: { memberVersion: "0", serverVersion: "0" },
        snapshot: createSnapshot(),
        userId: "user-1",
      });

      const cachedBeforeInvalidation = await readCachedChannelPermissionSnapshot(
        "user-1",
        "channel-1",
        {
          revisionsByUser: new Map([["user-1", { memberVersion: "0", serverVersion: "0" }]]),
        },
      );
      assert.equal(cachedBeforeInvalidation?.permissions, PermissionBits.VIEW_CHANNEL);
      assert.equal(cachedBeforeInvalidation?.channel.name, "general");
      assert.deepEqual(cachedBeforeInvalidation?.channel.server, {
        features: ["GIFS_ENABLED"],
        messageCharacterLimit: 2000,
        // Ş1 §2: gönderim yolu sunucu geneli yavaş modu da bu anlık görüntüden
        // okuyor, o yüzden kolon önbelleğin şeklinin parçası.
        slowModeDelay: 0,
      });

      await publishPermissionCacheRevision({ serverId: "server-1", serverVersion: "1" });
      assert.equal(
        await readCachedChannelPermissionSnapshot("user-1", "channel-1", {
          revisionsByUser: new Map([["user-1", { memberVersion: "0", serverVersion: "1" }]]),
        }),
        null,
      );

      await writeCachedChannelPermissionSnapshot({
        channelId: "channel-1",
        revisions: { memberVersion: "0", serverVersion: "1" },
        snapshot: createSnapshot(),
        userId: "user-1",
      });
      await publishPermissionCacheRevision({
        memberVersion: "1",
        serverId: "server-1",
        serverVersion: "1",
        userId: "user-1",
      });
      assert.equal(
        await readCachedChannelPermissionSnapshot("user-1", "channel-1", {
          revisionsByUser: new Map([["user-1", { memberVersion: "1", serverVersion: "1" }]]),
        }),
        null,
      );
    });
  });

  it("does not write a snapshot when its sampled revision is already stale", async () => {
    await withPermissionCacheEnabled(async () => {
      const redis = new MemoryRedis();
      setPermissionCacheRedisForTest(redis);
      redis.setRaw("permission:server:server-1:v", "1");

      await writeCachedChannelPermissionSnapshot({
        channelId: "channel-1",
        revisions: { memberVersion: "0", serverVersion: "0" },
        snapshot: createSnapshot(),
        userId: "user-1",
      });

      assert.equal(await readCachedChannelPermissionSnapshot("user-1", "channel-1"), null);
    });
  });

  it("does not publish a visible-channel result under a revision sampled after its DB read", async () => {
    await withPermissionCacheEnabled(async () => {
      const redis = new MemoryRedis();
      setPermissionCacheRedisForTest(redis);

      const staleEntry = {
        channelIds: ["private-channel"],
        permission: PermissionBits.VIEW_CHANNEL,
        revisions: { memberVersion: "0", serverVersion: "0" },
        serverId: "server-1",
        type: ChannelType.TEXT,
        userId: "user-1",
      };

      // Deterministic revocation: state was read at revision 0, then the DB
      // transaction committed revision 1 before compare-before-write.
      redis.setRaw("permission:server:server-1:v", "1");
      await writeCachedVisibleChannelIdsBatch([staleEntry]);

      const readArgs = {
        permission: PermissionBits.VIEW_CHANNEL,
        revisionsByUser: new Map([["user-1", { memberVersion: "0", serverVersion: "1" }]]),
        serverId: "server-1",
        type: ChannelType.TEXT,
        userIds: ["user-1"],
      };
      const cached = await readCachedVisibleChannelIdsBatch(readArgs);

      assert.equal(cached.has("user-1"), false);
    });
  });

  it("rejects an old VIEW_CHANNEL grant when Redis invalidation partially fails", async () => {
    await withPermissionCacheEnabled(async () => {
      const redis = new MemoryRedis();
      setPermissionCacheRedisForTest(redis);
      await writeCachedVisibleChannelIdsBatch([
        {
          channelIds: ["private-channel"],
          permission: PermissionBits.VIEW_CHANNEL,
          revisions: { memberVersion: "0", serverVersion: "0" },
          serverId: "server-1",
          type: ChannelType.TEXT,
          userId: "user-1",
        },
      ]);

      redis.failNextPipelineCommand = true;
      await writeCachedVisibleChannelIdsBatch([
        {
          channelIds: ["private-channel"],
          permission: PermissionBits.VIEW_CHANNEL,
          revisions: { memberVersion: "0", serverVersion: "0" },
          serverId: "server-1",
          type: ChannelType.TEXT,
          userId: "user-1",
        },
      ]);
      redis.failNextEval = true;
      await assert.rejects(
        publishPermissionCacheRevision({
          memberVersion: "1",
          serverId: "server-1",
          serverVersion: "0",
          userId: "user-1",
        }),
        /simulated Redis eval failure/,
      );

      const readArgs = {
        permission: PermissionBits.VIEW_CHANNEL,
        revisionsByUser: new Map([["user-1", { memberVersion: "1", serverVersion: "0" }]]),
        serverId: "server-1",
        type: ChannelType.TEXT,
        userIds: ["user-1"],
      };
      const cached = await readCachedVisibleChannelIdsBatch(readArgs);

      assert.equal(cached.has("user-1"), false);
    });
  });

  it("retries monotonic revision publication safely after Redis recovery", async () => {
    await withPermissionCacheEnabled(async () => {
      const redis = new MemoryRedis();
      setPermissionCacheRedisForTest(redis);
      redis.failNextEval = true;

      await assert.rejects(
        publishPermissionCacheRevision({
          memberVersion: "1",
          serverId: "server-1",
          serverVersion: "0",
          userId: "user-1",
        }),
        /simulated Redis eval failure/,
      );

      assert.equal(
        await publishPermissionCacheRevision({
          memberVersion: "1",
          serverId: "server-1",
          serverVersion: "0",
          userId: "user-1",
        }),
        true,
      );

      await writeCachedVisibleChannelIdsBatch([
        {
          channelIds: [],
          permission: PermissionBits.VIEW_CHANNEL,
          revisions: { memberVersion: "1", serverVersion: "0" },
          serverId: "server-1",
          userId: "user-1",
        },
      ]);
      const cached = await readCachedVisibleChannelIdsBatch({
        permission: PermissionBits.VIEW_CHANNEL,
        revisionsByUser: new Map([["user-1", { memberVersion: "1", serverVersion: "0" }]]),
        serverId: "server-1",
        userIds: ["user-1"],
      });
      assert.deepEqual(cached.get("user-1"), []);
    });
  });

  it("treats visible channel list batches as stale per server and member version", async () => {
    await withPermissionCacheEnabled(async () => {
      await writeCachedVisibleChannelIdsBatch([
        {
          channelIds: ["channel-1"],
          permission: PermissionBits.VIEW_CHANNEL,
          revisions: { memberVersion: "0", serverVersion: "0" },
          serverId: "server-1",
          type: ChannelType.TEXT,
          userId: "user-1",
        },
        {
          channelIds: ["channel-2"],
          permission: PermissionBits.VIEW_CHANNEL,
          revisions: { memberVersion: "0", serverVersion: "0" },
          serverId: "server-1",
          type: ChannelType.TEXT,
          userId: "user-2",
        },
      ]);

      const cachedBeforeInvalidation = await readCachedVisibleChannelIdsBatch({
        permission: PermissionBits.VIEW_CHANNEL,
        revisionsByUser: new Map([
          ["user-1", { memberVersion: "0", serverVersion: "0" }],
          ["user-2", { memberVersion: "0", serverVersion: "0" }],
        ]),
        serverId: "server-1",
        type: ChannelType.TEXT,
        userIds: ["user-1", "user-2"],
      });
      assert.deepEqual(cachedBeforeInvalidation.get("user-1"), ["channel-1"]);
      assert.deepEqual(cachedBeforeInvalidation.get("user-2"), ["channel-2"]);

      await publishPermissionCacheRevision({
        memberVersion: "1",
        serverId: "server-1",
        serverVersion: "0",
        userId: "user-1",
      });
      const cachedAfterMemberInvalidation = await readCachedVisibleChannelIdsBatch({
        permission: PermissionBits.VIEW_CHANNEL,
        revisionsByUser: new Map([
          ["user-1", { memberVersion: "1", serverVersion: "0" }],
          ["user-2", { memberVersion: "0", serverVersion: "0" }],
        ]),
        serverId: "server-1",
        type: ChannelType.TEXT,
        userIds: ["user-1", "user-2"],
      });
      assert.equal(cachedAfterMemberInvalidation.has("user-1"), false);
      assert.deepEqual(cachedAfterMemberInvalidation.get("user-2"), ["channel-2"]);

      await publishPermissionCacheRevision({ serverId: "server-1", serverVersion: "1" });
      const cachedAfterServerInvalidation = await readCachedVisibleChannelIdsBatch({
        permission: PermissionBits.VIEW_CHANNEL,
        revisionsByUser: new Map([
          ["user-1", { memberVersion: "1", serverVersion: "1" }],
          ["user-2", { memberVersion: "0", serverVersion: "1" }],
        ]),
        serverId: "server-1",
        type: ChannelType.TEXT,
        userIds: ["user-1", "user-2"],
      });
      assert.equal(cachedAfterServerInvalidation.size, 0);
    });
  });

  it("reads many servers for one user in two Redis commands", async () => {
    await withPermissionCacheEnabled(async () => {
      const redis = new MemoryRedis();
      setPermissionCacheRedisForTest(redis);
      await writeCachedVisibleChannelIdsBatch([
        {
          channelIds: ["channel-1"],
          permission: PermissionBits.VIEW_CHANNEL,
          serverId: "server-1",
          userId: "user-1",
        },
        {
          channelIds: ["channel-2"],
          permission: PermissionBits.VIEW_CHANNEL,
          serverId: "server-2",
          userId: "user-1",
        },
      ]);
      redis.mgetCalls = 0;

      const cached = await readCachedVisibleChannelIdsByServerBatch({
        permission: PermissionBits.VIEW_CHANNEL,
        serverIds: ["server-1", "server-2"],
        userId: "user-1",
      });

      assert.deepEqual(cached.get("server-1"), ["channel-1"]);
      assert.deepEqual(cached.get("server-2"), ["channel-2"]);
      assert.equal(redis.mgetCalls, 2);
    });
  });

  it("treats over-age channel permission snapshots as stale when a max age is requested", async () => {
    await withPermissionCacheEnabled(async () => {
      const redis = new MemoryRedis();
      setPermissionCacheRedisForTest(redis);
      redis.setRaw(
        "permission:v2:channel:channel-1:user-1",
        JSON.stringify({
          cachedAt: Date.now() - 20_000,
          channel: createSnapshot().channel,
          context: {
            ownerId: "owner-1",
            roles: [
              {
                id: "everyone",
                isDefault: true,
                name: "@everyone",
                permissions: PermissionBits.VIEW_CHANNEL.toString(),
              },
            ],
            userId: "user-1",
          },
          explicitAllowPermissions: "0",
          memberVersion: "0",
          permissions: PermissionBits.VIEW_CHANNEL.toString(),
          serverVersion: "0",
        }),
      );

      const cachedWithoutMaxAge = await readCachedChannelPermissionSnapshot("user-1", "channel-1");
      assert.equal(cachedWithoutMaxAge?.permissions, PermissionBits.VIEW_CHANNEL);

      assert.equal(
        await readCachedChannelPermissionSnapshot("user-1", "channel-1", {
          maxAgeSeconds: 15,
        }),
        null,
      );
    });
  });

  it("treats over-age visible channel lists as stale when a max age is requested", async () => {
    await withPermissionCacheEnabled(async () => {
      const redis = new MemoryRedis();
      setPermissionCacheRedisForTest(redis);
      redis.setRaw(
        `permission:v2:channels:server-1:user-1:${PermissionBits.VIEW_CHANNEL}:TEXT`,
        JSON.stringify({
          cachedAt: Date.now() - 20_000,
          channelIds: ["channel-1"],
          memberVersion: "0",
          serverVersion: "0",
        }),
      );

      const cachedWithoutMaxAge = await readCachedVisibleChannelIdsBatch({
        permission: PermissionBits.VIEW_CHANNEL,
        serverId: "server-1",
        type: ChannelType.TEXT,
        userIds: ["user-1"],
      });
      assert.deepEqual(cachedWithoutMaxAge.get("user-1"), ["channel-1"]);

      const cached = await readCachedVisibleChannelIdsBatch({
        maxAgeSeconds: 15,
        permission: PermissionBits.VIEW_CHANNEL,
        serverId: "server-1",
        type: ChannelType.TEXT,
        userIds: ["user-1"],
      });

      assert.equal(cached.has("user-1"), false);
    });
  });
});
