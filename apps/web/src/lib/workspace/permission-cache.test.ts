import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType } from "@wizards/db";
import {
  type CachedChannelPermissionSnapshot,
  invalidateMemberPermissionCache,
  invalidateServerPermissionCache,
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

  setRaw(key: string, value: string) {
    this.values.set(key, value);
  }

  async mget(...keys: string[]) {
    this.mgetCalls += 1;
    return keys.map((key) => this.values.get(key) ?? null);
  }

  pipeline() {
    const operations: Array<() => void> = [];
    const pipeline = {
      exec: async () => {
        for (const operation of operations) {
          operation();
        }
        return [];
      },
      expire: () => pipeline,
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
      );
      assert.equal(cachedBeforeInvalidation?.permissions, PermissionBits.VIEW_CHANNEL);
      assert.equal(cachedBeforeInvalidation?.channel.name, "general");
      assert.deepEqual(cachedBeforeInvalidation?.channel.server, {
        features: ["GIFS_ENABLED"],
        messageCharacterLimit: 2000,
      });

      await invalidateServerPermissionCache("server-1");
      assert.equal(await readCachedChannelPermissionSnapshot("user-1", "channel-1"), null);

      await writeCachedChannelPermissionSnapshot({
        channelId: "channel-1",
        revisions: { memberVersion: "0", serverVersion: "1" },
        snapshot: createSnapshot(),
        userId: "user-1",
      });
      await invalidateMemberPermissionCache("server-1", "user-1");
      assert.equal(await readCachedChannelPermissionSnapshot("user-1", "channel-1"), null);
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

  it("treats visible channel list batches as stale per server and member version", async () => {
    await withPermissionCacheEnabled(async () => {
      await writeCachedVisibleChannelIdsBatch([
        {
          channelIds: ["channel-1"],
          permission: PermissionBits.VIEW_CHANNEL,
          serverId: "server-1",
          type: ChannelType.TEXT,
          userId: "user-1",
        },
        {
          channelIds: ["channel-2"],
          permission: PermissionBits.VIEW_CHANNEL,
          serverId: "server-1",
          type: ChannelType.TEXT,
          userId: "user-2",
        },
      ]);

      const cachedBeforeInvalidation = await readCachedVisibleChannelIdsBatch({
        permission: PermissionBits.VIEW_CHANNEL,
        serverId: "server-1",
        type: ChannelType.TEXT,
        userIds: ["user-1", "user-2"],
      });
      assert.deepEqual(cachedBeforeInvalidation.get("user-1"), ["channel-1"]);
      assert.deepEqual(cachedBeforeInvalidation.get("user-2"), ["channel-2"]);

      await invalidateMemberPermissionCache("server-1", "user-1");
      const cachedAfterMemberInvalidation = await readCachedVisibleChannelIdsBatch({
        permission: PermissionBits.VIEW_CHANNEL,
        serverId: "server-1",
        type: ChannelType.TEXT,
        userIds: ["user-1", "user-2"],
      });
      assert.equal(cachedAfterMemberInvalidation.has("user-1"), false);
      assert.deepEqual(cachedAfterMemberInvalidation.get("user-2"), ["channel-2"]);

      await invalidateServerPermissionCache("server-1");
      const cachedAfterServerInvalidation = await readCachedVisibleChannelIdsBatch({
        permission: PermissionBits.VIEW_CHANNEL,
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
