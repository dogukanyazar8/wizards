import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType } from "@wizards/db";
import {
  type CachedChannelPermissionSnapshot,
  invalidateMemberPermissionCache,
  invalidateServerPermissionCache,
  readCachedChannelPermissionSnapshot,
  readCachedVisibleChannelIdsBatch,
  setPermissionCacheRedisForTest,
  writeCachedChannelPermissionSnapshot,
  writeCachedVisibleChannelIdsBatch,
} from "./permission-cache";
import { PermissionBits } from "./permissions";

class MemoryRedis {
  private readonly values = new Map<string, string>();

  async mget(...keys: string[]) {
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

function restoreEnv(name: "PERMISSION_CACHE_DISABLED" | "PERMISSION_CACHE_ENABLED", value?: string) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function withPermissionCacheEnabled(
  run: () => Promise<void>,
) {
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
      locked: false,
      name: "general",
      server: {
        features: ["GIFS_ENABLED"],
        messageCharacterLimit: 2000,
      },
      serverId: "server-1",
      type: ChannelType.TEXT,
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
        snapshot: createSnapshot(),
        userId: "user-1",
      });
      await invalidateMemberPermissionCache("server-1", "user-1");
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
});
