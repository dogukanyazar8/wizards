import { prisma, type Prisma } from "@wizards/db";
import { GameActivitySchema, type GameId } from "@wizards/types";
import { ApiError } from "@/lib/api";
import { getRedisOp } from "@/lib/redis";
import { readPresenceMap } from "@/lib/presence";
import { resolveVisibilityDecisions } from "@/lib/privacy/visibility-policy";
import { logError } from "@/lib/logger";

export const GAME_ACTIVITY_TTL_MS = 70_000;
const keyFor = (userId: string) => `game-activity:${userId}`;

// One live desktop owns the activity until it stops or expires. A stale desktop's
// cleanup cannot erase another desktop's game. The client supplies no timestamps.
export const UPDATE_GAME_ACTIVITY_SCRIPT = `
local owner = redis.call('HGET', KEYS[1], 'sessionId')
if owner and owner ~= ARGV[1] then return 0 end
if ARGV[2] == '' then redis.call('DEL', KEYS[1]); return 1 end
local previous = redis.call('HGET', KEYS[1], 'gameId')
local started = redis.call('HGET', KEYS[1], 'startedAt')
if previous ~= ARGV[2] or not started then started = ARGV[3] end
redis.call('HSET', KEYS[1], 'sessionId', ARGV[1], 'gameId', ARGV[2], 'startedAt', started, 'expiresAt', ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return 1
`;

export async function getGameSharingSettings(userId: string) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { showCurrentGame: true },
  });
  if (!settings) throw new ApiError("Account settings not found", 404, "NOT_FOUND");
  return { enabled: settings.showCurrentGame };
}

// All game writes serialize on the existing settings row. Disabling cannot race
// a heartbeat into publishing a fresh record after the privacy change commits.
async function withGameSharingLock<T>(
  userId: string,
  work: (enabled: boolean, tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ showCurrentGame: boolean }>>`
      SELECT "showCurrentGame" FROM "UserSettings" WHERE "userId" = ${userId} FOR UPDATE
    `;
    if (!rows[0]) throw new ApiError("Account settings not found", 404, "NOT_FOUND");
    return work(rows[0].showCurrentGame, tx);
  });
}

export async function updateGameSharingSettings(userId: string, enabled: boolean) {
  const result = await withGameSharingLock(userId, async (_previous, tx) => {
    // Clear on either transition: turning on must not resurrect earlier activity.
    if (enabled) await getRedisOp().del(keyFor(userId));
    await tx.userSettings.update({ where: { userId }, data: { showCurrentGame: enabled } });
    return { enabled };
  });
  if (!enabled) {
    // The privacy write commits even when Redis is unavailable. Every reader checks it.
    try {
      await getRedisOp().del(keyFor(userId));
    } catch (error) {
      logError("[game-activity] Failed to clear disabled activity", error);
    }
  }
  return result;
}

export async function publishGameActivity(
  userId: string,
  input: { gameId: GameId | null; sessionId: string },
) {
  return withGameSharingLock(userId, async (enabled, tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { status: true, deletedAt: true },
    });
    if (
      !user ||
      user.deletedAt ||
      !enabled ||
      user.status === "OFFLINE" ||
      user.status === "INVISIBLE"
    ) {
      await getRedisOp().del(keyFor(userId));
      return;
    }
    const now = Date.now();
    await getRedisOp().eval(
      UPDATE_GAME_ACTIVITY_SCRIPT,
      1,
      keyFor(userId),
      input.sessionId,
      input.gameId ?? "",
      new Date(now).toISOString(),
      new Date(now + GAME_ACTIVITY_TTL_MS).toISOString(),
      GAME_ACTIVITY_TTL_MS,
    );
  });
}

export async function readGameActivity(requesterId: string, userId: string) {
  const [settings, decisions] = await Promise.all([
    prisma.userSettings.findUnique({
      where: { userId },
      select: { showCurrentGame: true, user: { select: { deletedAt: true, status: true } } },
    }),
    resolveVisibilityDecisions(requesterId, [userId]),
  ]);
  const decision = decisions.get(userId);
  if (
    !settings?.showCurrentGame ||
    settings.user.deletedAt ||
    !decision?.canViewPresence ||
    !decision.canViewProfile ||
    ["OFFLINE", "INVISIBLE"].includes(settings.user.status)
  )
    return null;
  const redis = getRedisOp();
  const presence = await readPresenceMap(redis, [
    { userId, customStatus: null, status: "OFFLINE" },
  ]);
  if (presence.get(userId)?.status === "OFFLINE" || !presence.has(userId)) return null;
  const record = await redis.hgetall(keyFor(userId));
  const parsed = GameActivitySchema.safeParse({
    gameId: record.gameId,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
  });
  return parsed.success && Date.parse(parsed.data.expiresAt) > Date.now() ? parsed.data : null;
}
