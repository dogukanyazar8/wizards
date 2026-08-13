import type Redis from "ioredis";

import { checkRateLimit } from "@/lib/rate-limit";

type RateLimitCheck = typeof checkRateLimit;
type SlowModeCheck = (
  redis: Redis,
  key: string,
  delaySeconds: number,
) => Promise<{ allowed: boolean; retryAfterSeconds: number }>;

type RateLimitAvailabilityResult =
  | { status: "allowed" }
  | { status: "limited" }
  | { status: "unavailable"; allowDuringGrace: boolean; error: unknown };

type RateLimitUnavailableLogScope =
  "channel-message" | "channel-message-edit" | "dm-delivery" | "dm-message";

const rateLimitUnavailableLogState: Record<RateLimitUnavailableLogScope, number> = {
  "channel-message": Number.NEGATIVE_INFINITY,
  "channel-message-edit": Number.NEGATIVE_INFINITY,
  "dm-delivery": Number.NEGATIVE_INFINITY,
  "dm-message": Number.NEGATIVE_INFINITY,
};

export type ChannelMessageRateLimitResult = RateLimitAvailabilityResult;

export type ChannelSlowModeResult =
  | { status: "allowed" }
  | { status: "limited"; retryAfterSeconds: number }
  | { status: "unavailable"; error: unknown };

export type DMMessageRateLimitResult =
  | { status: "allowed" }
  | { status: "global" }
  | { status: "conversation" }
  | { status: "unavailable"; allowDuringGrace: boolean; error: unknown };

export const CHANNEL_MESSAGE_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 60,
} as const;

export const CHANNEL_MESSAGE_EDIT_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 60,
} as const;

const CHANNEL_SLOW_MODE_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local delayMs = tonumber(ARGV[2])
local lastSentAt = redis.call("GET", key)

if lastSentAt then
  local remainingMs = delayMs - (now - tonumber(lastSentAt))
  if remainingMs > 0 then
    return {0, math.ceil(remainingMs / 1000)}
  end
end

redis.call("SET", key, now, "PX", delayMs)
return {1, 0}
`;

export const RATE_LIMIT_UNAVAILABLE_LOG_INTERVAL_MS = 30_000;
export const RATE_LIMIT_UNAVAILABLE_GRACE_MS = 5_000;
const RATE_LIMIT_UNAVAILABLE_GRACE_STALE_MS = RATE_LIMIT_UNAVAILABLE_GRACE_MS * 2;
export const RATE_LIMIT_UNAVAILABLE_GRACE_LIMIT = 5;

export const DM_MESSAGE_GLOBAL_RATE_LIMIT = {
  limit: 120,
  windowSeconds: 60,
} as const;

export const DM_MESSAGE_CONVERSATION_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 60,
} as const;

export const DM_DELIVERY_ACK_RATE_LIMIT = {
  limit: 120,
  windowSeconds: 60,
} as const;

export function shouldLogRateLimitUnavailable(
  scope: RateLimitUnavailableLogScope,
  now = Date.now(),
) {
  const lastLoggedAt = rateLimitUnavailableLogState[scope];

  if (now - lastLoggedAt < RATE_LIMIT_UNAVAILABLE_LOG_INTERVAL_MS) {
    return false;
  }

  rateLimitUnavailableLogState[scope] = now;
  return true;
}

export function resetRateLimitUnavailableGraceForTest() {
  // Grace state lives in Redis so every production worker shares one outage budget.
  // Tests inject isolated Redis doubles; there is no module-local state to clear.
}

const RATE_LIMIT_UNAVAILABLE_GRACE_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local graceMs = tonumber(ARGV[2])
local staleMs = tonumber(ARGV[3])
local limit = tonumber(ARGV[4])

local firstUnavailableAt = redis.call("HGET", key, "firstUnavailableAt")
local attempts = redis.call("HGET", key, "attempts")

if not firstUnavailableAt then
  firstUnavailableAt = now
  attempts = 0
  redis.call("HSET", key, "firstUnavailableAt", firstUnavailableAt, "attempts", attempts)
end

redis.call("PEXPIRE", key, staleMs)

if now - tonumber(firstUnavailableAt) > graceMs then
  return 0
end

if tonumber(attempts) >= limit then
  return 0
end

redis.call("HINCRBY", key, "attempts", 1)
return 1
`;

function getRateLimitUnavailableGraceKey(key: string) {
  return `rate:unavailable-grace:${key}`;
}

async function consumeRateLimitUnavailableGrace(redis: Redis, key: string, now: number) {
  try {
    const result = await redis.eval(
      RATE_LIMIT_UNAVAILABLE_GRACE_SCRIPT,
      1,
      getRateLimitUnavailableGraceKey(key),
      now,
      RATE_LIMIT_UNAVAILABLE_GRACE_MS,
      RATE_LIMIT_UNAVAILABLE_GRACE_STALE_MS,
      RATE_LIMIT_UNAVAILABLE_GRACE_LIMIT,
    );

    return String(result) === "1";
  } catch {
    return false;
  }
}

async function runRateLimitCheck(args: {
  key: string;
  limit: number;
  now?: () => number;
  rateLimitCheck: RateLimitCheck | undefined;
  redis: Redis;
  windowSeconds: number;
}): Promise<RateLimitAvailabilityResult> {
  try {
    const isAllowed = await (args.rateLimitCheck ?? checkRateLimit)(
      args.redis,
      args.key,
      args.limit,
      args.windowSeconds,
    );

    return isAllowed ? { status: "allowed" } : { status: "limited" };
  } catch (error) {
    return {
      status: "unavailable",
      allowDuringGrace: await consumeRateLimitUnavailableGrace(
        args.redis,
        args.key,
        args.now?.() ?? Date.now(),
      ),
      error,
    };
  }
}

export async function checkChannelMessageRateLimit(args: {
  now?: () => number;
  rateLimitCheck?: RateLimitCheck;
  redis: Redis;
  userId: string;
}): Promise<ChannelMessageRateLimitResult> {
  return runRateLimitCheck({
    key: `rate:msg:${args.userId}`,
    limit: CHANNEL_MESSAGE_RATE_LIMIT.limit,
    ...(args.now ? { now: args.now } : {}),
    rateLimitCheck: args.rateLimitCheck,
    redis: args.redis,
    windowSeconds: CHANNEL_MESSAGE_RATE_LIMIT.windowSeconds,
  });
}

export async function checkChannelMessageEditRateLimit(args: {
  now?: () => number;
  rateLimitCheck?: RateLimitCheck;
  redis: Redis;
  userId: string;
}): Promise<ChannelMessageRateLimitResult> {
  return runRateLimitCheck({
    key: `rate:msg:edit:${args.userId}`,
    limit: CHANNEL_MESSAGE_EDIT_RATE_LIMIT.limit,
    ...(args.now ? { now: args.now } : {}),
    rateLimitCheck: args.rateLimitCheck,
    redis: args.redis,
    windowSeconds: CHANNEL_MESSAGE_EDIT_RATE_LIMIT.windowSeconds,
  });
}

async function runSlowModeCheck(
  redis: Redis,
  key: string,
  delaySeconds: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const result = await redis.eval(
    CHANNEL_SLOW_MODE_SCRIPT,
    1,
    key,
    Date.now(),
    delaySeconds * 1_000,
  );
  const [allowed, retryAfterSeconds] = Array.isArray(result) ? result : [0, delaySeconds];

  return {
    allowed: String(allowed) === "1",
    retryAfterSeconds: Math.max(1, Number(retryAfterSeconds) || delaySeconds),
  };
}

export async function checkChannelSlowMode(args: {
  channelId: string;
  delaySeconds: number;
  redis: Redis;
  slowModeCheck?: SlowModeCheck;
  userId: string;
}): Promise<ChannelSlowModeResult> {
  if (args.delaySeconds === 0) {
    return { status: "allowed" };
  }

  try {
    const result = await (args.slowModeCheck ?? runSlowModeCheck)(
      args.redis,
      `rate:channel-slow:${args.channelId}:${args.userId}`,
      args.delaySeconds,
    );

    return result.allowed
      ? { status: "allowed" }
      : { retryAfterSeconds: result.retryAfterSeconds, status: "limited" };
  } catch (error) {
    return { error, status: "unavailable" };
  }
}

export async function checkDMMessageRateLimits(args: {
  conversationId: string;
  now?: () => number;
  rateLimitCheck?: RateLimitCheck;
  redis: Redis;
  userId: string;
}): Promise<DMMessageRateLimitResult> {
  const globalResult = await runRateLimitCheck({
    key: `rate:dm:global:${args.userId}`,
    limit: DM_MESSAGE_GLOBAL_RATE_LIMIT.limit,
    ...(args.now ? { now: args.now } : {}),
    rateLimitCheck: args.rateLimitCheck,
    redis: args.redis,
    windowSeconds: DM_MESSAGE_GLOBAL_RATE_LIMIT.windowSeconds,
  });

  if (globalResult.status === "limited") {
    return { status: "global" };
  }

  if (globalResult.status === "unavailable") {
    return globalResult;
  }

  const conversationResult = await runRateLimitCheck({
    key: `rate:dm:${args.userId}:${args.conversationId}`,
    limit: DM_MESSAGE_CONVERSATION_RATE_LIMIT.limit,
    ...(args.now ? { now: args.now } : {}),
    rateLimitCheck: args.rateLimitCheck,
    redis: args.redis,
    windowSeconds: DM_MESSAGE_CONVERSATION_RATE_LIMIT.windowSeconds,
  });

  if (conversationResult.status === "limited") {
    return { status: "conversation" };
  }

  return conversationResult;
}

export async function checkDMDeliveryAckRateLimit(args: {
  now?: () => number;
  rateLimitCheck?: RateLimitCheck;
  redis: Redis;
  userId: string;
}): Promise<RateLimitAvailabilityResult> {
  return runRateLimitCheck({
    key: `rate:dm:delivery:${args.userId}`,
    limit: DM_DELIVERY_ACK_RATE_LIMIT.limit,
    ...(args.now ? { now: args.now } : {}),
    rateLimitCheck: args.rateLimitCheck,
    redis: args.redis,
    windowSeconds: DM_DELIVERY_ACK_RATE_LIMIT.windowSeconds,
  });
}
