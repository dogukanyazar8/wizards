import type Redis from "ioredis";

import { checkRateLimit } from "@/lib/rate-limit";

type RateLimitCheck = typeof checkRateLimit;

type RateLimitAvailabilityResult =
  | { status: "allowed" }
  | { status: "limited" }
  | { status: "unavailable"; error: unknown };

type RateLimitUnavailableLogScope = "channel-message" | "dm-message";

const rateLimitUnavailableLogState: Record<RateLimitUnavailableLogScope, number> = {
  "channel-message": Number.NEGATIVE_INFINITY,
  "dm-message": Number.NEGATIVE_INFINITY,
};

export type ChannelMessageRateLimitResult = RateLimitAvailabilityResult;

export type DMMessageRateLimitResult =
  | { status: "allowed" }
  | { status: "global" }
  | { status: "conversation" }
  | { status: "unavailable"; error: unknown };

export const CHANNEL_MESSAGE_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 60,
} as const;

export const RATE_LIMIT_UNAVAILABLE_LOG_INTERVAL_MS = 30_000;

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

async function runRateLimitCheck(args: {
  key: string;
  limit: number;
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
    return { status: "unavailable", error };
  }
}

export async function checkChannelMessageRateLimit(args: {
  rateLimitCheck?: RateLimitCheck;
  redis: Redis;
  userId: string;
}): Promise<ChannelMessageRateLimitResult> {
  return runRateLimitCheck({
    key: `rate:msg:${args.userId}`,
    limit: CHANNEL_MESSAGE_RATE_LIMIT.limit,
    rateLimitCheck: args.rateLimitCheck,
    redis: args.redis,
    windowSeconds: CHANNEL_MESSAGE_RATE_LIMIT.windowSeconds,
  });
}

export async function checkDMMessageRateLimits(args: {
  conversationId: string;
  rateLimitCheck?: RateLimitCheck;
  redis: Redis;
  userId: string;
}): Promise<DMMessageRateLimitResult> {
  const globalResult = await runRateLimitCheck({
    key: `rate:dm:global:${args.userId}`,
    limit: DM_MESSAGE_GLOBAL_RATE_LIMIT.limit,
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
    rateLimitCheck: args.rateLimitCheck,
    redis: args.redis,
    windowSeconds: DM_MESSAGE_CONVERSATION_RATE_LIMIT.windowSeconds,
  });

  if (conversationResult.status === "limited") {
    return { status: "conversation" };
  }

  return conversationResult;
}
