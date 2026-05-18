import type Redis from "ioredis";

import { checkRateLimit } from "@/lib/rate-limit";

type RateLimitCheck = typeof checkRateLimit;

type RateLimitAvailabilityResult =
  | { status: "allowed" }
  | { status: "limited" }
  | { status: "unavailable"; allowDuringGrace: boolean; error: unknown };

type RateLimitUnavailableLogScope = "channel-message" | "channel-message-edit" | "dm-message";

const rateLimitUnavailableLogState: Record<RateLimitUnavailableLogScope, number> = {
  "channel-message": Number.NEGATIVE_INFINITY,
  "channel-message-edit": Number.NEGATIVE_INFINITY,
  "dm-message": Number.NEGATIVE_INFINITY,
};

export type ChannelMessageRateLimitResult = RateLimitAvailabilityResult;

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
