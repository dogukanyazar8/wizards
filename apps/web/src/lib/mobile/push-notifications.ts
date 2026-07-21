import { createHash } from "node:crypto";

import { prisma } from "@wizards/db";
import {
  MobilePushRegistrationRevokeResponseSchema,
  MobilePushRegistrationResponseSchema,
  type MobilePushPlatform,
  type MobilePushProvider,
  type MobilePushRegistrationRevokeResponse,
  type MobilePushRegistrationResponse,
} from "@wizards/types";

/**
 * Structural slice of PrismaClient so tests can substitute an in-memory store
 * (same pattern the Redis-backed version used).
 */
export interface MobilePushTokenStore {
  mobilePushToken: {
    deleteMany(args: {
      where: { NOT?: { sessionKey: string }; sessionKey?: string; token?: string };
    }): Promise<{ count: number }>;
    upsert(args: {
      create: {
        platform: string;
        provider: string;
        sessionKey: string;
        token: string;
        tokenFingerprint: string;
        userId: string;
      };
      update: {
        platform: string;
        provider: string;
        token: string;
        tokenFingerprint: string;
        userId: string;
      };
      where: { sessionKey: string };
    }): Promise<unknown>;
  };
}

interface RegisterMobilePushTokenInput {
  db?: MobilePushTokenStore;
  now?: Date;
  platform: MobilePushPlatform;
  provider: MobilePushProvider;
  sessionId: string;
  token: string;
  userId: string;
}

interface RevokeMobilePushTokenInput {
  db?: MobilePushTokenStore;
  now?: Date;
  sessionId: string;
}

export function hashMobilePushSessionId(sessionId: string) {
  return createHash("sha256").update(sessionId).digest("base64url");
}

export function getMobilePushTokenFingerprint(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export async function registerMobilePushToken({
  db = prisma,
  now = new Date(),
  platform,
  provider,
  sessionId,
  token,
  userId,
}: RegisterMobilePushTokenInput): Promise<MobilePushRegistrationResponse> {
  const sessionKey = hashMobilePushSessionId(sessionId);
  const tokenFingerprint = getMobilePushTokenFingerprint(token);

  // A device token follows the newest session: drop any older session that
  // still holds it, then upsert this session's row.
  await db.mobilePushToken.deleteMany({ where: { NOT: { sessionKey }, token } });
  await db.mobilePushToken.upsert({
    create: { platform, provider, sessionKey, token, tokenFingerprint, userId },
    update: { platform, provider, token, tokenFingerprint, userId },
    where: { sessionKey },
  });

  return MobilePushRegistrationResponseSchema.parse({
    provider,
    registered: true,
    registeredAt: now.toISOString(),
    tokenFingerprint,
  });
}

export async function revokeMobilePushToken({
  db = prisma,
  now = new Date(),
  sessionId,
}: RevokeMobilePushTokenInput): Promise<MobilePushRegistrationRevokeResponse> {
  const { count } = await db.mobilePushToken.deleteMany({
    where: { sessionKey: hashMobilePushSessionId(sessionId) },
  });

  return MobilePushRegistrationRevokeResponseSchema.parse({
    revoked: count > 0,
    revokedAt: now.toISOString(),
  });
}
