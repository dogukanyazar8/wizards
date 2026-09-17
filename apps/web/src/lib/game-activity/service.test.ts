import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, it } from "node:test";
import { prisma } from "@wizards/db";
import { GameActivityUpdateSchema, GAME_CATALOG } from "@wizards/types";
import { getRedisOp } from "@/lib/redis";
import { publishGameActivity, readGameActivity, updateGameSharingSettings } from "./service";

// Opt-in integration target; never silently connect to a developer's configured remote Redis.
const enabled = process.env.GAME_ACTIVITY_TEST_REDIS_URL;
if (enabled) process.env.REDIS_URL = enabled;
const test = enabled ? it : it.skip;
const userId = `game-test-${randomUUID()}`;
const viewerId = `viewer-${randomUUID()}`;
const sessionId = randomUUID();
const key = `game-activity:${userId}`;
const presenceKey = `presence:${userId}`;
const socketKey = `presence:socket-set:${userId}`;
const restores: Array<() => void> = [];
function patch(target: object, property: string, replacement: unknown) {
  const record = target as Record<string, unknown>;
  const original = record[property];
  record[property] = replacement;
  restores.push(() => {
    record[property] = original;
  });
}
let sharing = true;
let status = "ONLINE";
let visibility = "EVERYONE";
let blocked = false;
before(async () => {
  if (enabled) await getRedisOp().ping();
});
beforeEach(async () => {
  if (!enabled) return;
  sharing = true;
  status = "ONLINE";
  visibility = "EVERYONE";
  blocked = false;
  patch(prisma, "$transaction", async (work: (tx: unknown) => Promise<unknown>) =>
    work({
      $queryRaw: async () => [{ showCurrentGame: sharing }],
      user: { findUnique: async () => ({ status, deletedAt: null }) },
      userSettings: {
        update: async ({ data }: { data: { showCurrentGame: boolean } }) => {
          sharing = data.showCurrentGame;
        },
      },
    }),
  );
  patch(prisma.userSettings, "findUnique", async () => ({
    showCurrentGame: sharing,
    user: { status, deletedAt: null },
  }));
  patch(prisma.user, "findMany", async () => [
    { id: userId, settings: { presenceVisibility: visibility, profileVisibility: "EVERYONE" } },
  ]);
  patch(prisma.friendRequest, "findMany", async () =>
    blocked ? [{ senderId: userId, receiverId: viewerId, status: "BLOCKED" }] : [],
  );
  await getRedisOp().hset(presenceKey, "status", "ONLINE");
  await getRedisOp().zadd(socketKey, Date.now() + 120_000, "test-socket");
  await getRedisOp().pexpire(presenceKey, 120_000);
  await getRedisOp().pexpire(socketKey, 120_000);
});
afterEach(async () => {
  for (const restore of restores.splice(0).reverse()) restore();
  if (enabled) await getRedisOp().del(key, presenceKey, socketKey);
});
after(() => {
  if (enabled) getRedisOp().disconnect();
});

it("accepts catalog game ids, never process paths or client timestamps", () => {
  for (const game of GAME_CATALOG)
    assert.equal(GameActivityUpdateSchema.safeParse({ gameId: game.id, sessionId }).success, true);
  for (const payload of [
    { gameId: "java.exe", sessionId },
    { gameId: "cs2", sessionId, processPath: "C:/private" },
    { gameId: "cs2", sessionId, startedAt: "2020-01-01" },
  ]) {
    assert.equal(GameActivityUpdateSchema.safeParse(payload).success, false);
  }
});
test("publishes a visible game, renews its start time, and stops it", async () => {
  await publishGameActivity(userId, { gameId: "cs2", sessionId });
  const first = await readGameActivity(viewerId, userId);
  assert.equal(first?.gameId, "cs2");
  assert.ok(first && Date.parse(first.expiresAt) > Date.now());
  await publishGameActivity(userId, { gameId: "cs2", sessionId });
  assert.equal((await readGameActivity(viewerId, userId))?.startedAt, first?.startedAt);
  assert.ok((await getRedisOp().pttl(key)) <= 70_000);
  await publishGameActivity(userId, { gameId: null, sessionId });
  assert.equal(await readGameActivity(viewerId, userId), null);
});
test("a second desktop cannot steal or clear the active desktop's game", async () => {
  await publishGameActivity(userId, { gameId: "cs2", sessionId });
  const other = randomUUID();
  await publishGameActivity(userId, { gameId: "dota-2", sessionId: other });
  await publishGameActivity(userId, { gameId: null, sessionId: other });
  assert.equal((await readGameActivity(viewerId, userId))?.gameId, "cs2");
  await getRedisOp().del(key); // Simulate TTL expiry without sleeping.
  await publishGameActivity(userId, { gameId: "dota-2", sessionId: other });
  assert.equal((await readGameActivity(viewerId, userId))?.gameId, "dota-2");
});

test("custom labels are sanitized, cleared for catalog games, and hidden when sharing is disabled", async () => {
  await publishGameActivity(userId, {
    gameId: "custom:012345abcdef",
    label: "  My\u0000  Game\u200b  ",
    sessionId,
  });
  assert.equal((await readGameActivity(viewerId, userId))?.label, "My Game");
  assert.equal(await getRedisOp().hget(key, "label"), "My Game");
  await publishGameActivity(userId, { gameId: "cs2", label: "Discard me", sessionId });
  assert.equal((await readGameActivity(viewerId, userId))?.label, null);
  assert.equal(await getRedisOp().hget(key, "label"), "");
  await publishGameActivity(userId, {
    gameId: "custom:012345abcdef",
    label: "Private Game",
    sessionId,
  });
  sharing = false;
  assert.equal(await readGameActivity(viewerId, userId), null);
});
test("disabling sharing removes the activity and enabling cannot resurrect it", async () => {
  await publishGameActivity(userId, { gameId: "cs2", sessionId });
  await updateGameSharingSettings(userId, false);
  assert.equal(sharing, false);
  await publishGameActivity(userId, { gameId: "cs2", sessionId });
  assert.equal(await readGameActivity(viewerId, userId), null);
  await updateGameSharingSettings(userId, true);
  assert.equal(await readGameActivity(viewerId, userId), null);
});
test("invisible, offline, blocked and restricted audiences never receive activity", async () => {
  await publishGameActivity(userId, { gameId: "minecraft", sessionId });
  status = "INVISIBLE";
  assert.equal(await readGameActivity(viewerId, userId), null);
  status = "OFFLINE";
  assert.equal(await readGameActivity(viewerId, userId), null);
  status = "ONLINE";
  blocked = true;
  assert.equal(await readGameActivity(viewerId, userId), null);
  blocked = false;
  visibility = "FRIENDS";
  assert.equal(await readGameActivity(viewerId, userId), null);
  visibility = "NOBODY";
  assert.equal(await readGameActivity(viewerId, userId), null);
});
test("disconnects and expired records hide even a cached game", async () => {
  await publishGameActivity(userId, { gameId: "cs2", sessionId });
  await getRedisOp().del(socketKey);
  assert.equal(await readGameActivity(viewerId, userId), null);
  await getRedisOp().zadd(socketKey, Date.now() + 120_000, "test-socket");
  await getRedisOp().hset(key, "expiresAt", "2000-01-01T00:00:00.000Z");
  assert.equal(await readGameActivity(viewerId, userId), null);
});
