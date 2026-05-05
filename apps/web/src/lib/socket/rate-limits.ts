import type Redis from "ioredis";
import { checkRateLimit } from "@/lib/rate-limit";

export const DM_MESSAGE_GLOBAL_RATE_LIMIT = {
  limit: 120,
  windowSeconds: 60,
} as const;

export const DM_MESSAGE_CONVERSATION_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 60,
} as const;

export async function checkDMMessageRateLimits(args: {
  conversationId: string;
  redis: Redis;
  userId: string;
}) {
  const isGlobalAllowed = await checkRateLimit(
    args.redis,
    `rate:dm:global:${args.userId}`,
    DM_MESSAGE_GLOBAL_RATE_LIMIT.limit,
    DM_MESSAGE_GLOBAL_RATE_LIMIT.windowSeconds,
  );

  if (!isGlobalAllowed) {
    return "global";
  }

  const isConversationAllowed = await checkRateLimit(
    args.redis,
    `rate:dm:${args.userId}:${args.conversationId}`,
    DM_MESSAGE_CONVERSATION_RATE_LIMIT.limit,
    DM_MESSAGE_CONVERSATION_RATE_LIMIT.windowSeconds,
  );

  return isConversationAllowed ? "allowed" : "conversation";
}
