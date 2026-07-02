import { createHash } from "node:crypto";

import {
  MobilePushRegistrationRevokeResponseSchema,
  MobilePushRegistrationResponseSchema,
  type MobilePushPlatform,
  type MobilePushProvider,
  type MobilePushRegistrationRevokeResponse,
  type MobilePushRegistrationResponse,
} from "@wizards/types";

import { getRedis } from "@/lib/redis";

export const MOBILE_PUSH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const MOBILE_PUSH_TOKEN_KEY_PREFIX = "mobile:push-token:";

interface MobilePushRedis {
  del(key: string): Promise<number>;
  set(
    key: string,
    value: string,
    mode: "EX",
    ttlSeconds: number,
  ): Promise<"OK" | null>;
}

interface RegisterMobilePushTokenInput {
  now?: Date;
  platform: MobilePushPlatform;
  provider: MobilePushProvider;
  redis?: MobilePushRedis;
  sessionId: string;
  token: string;
  userId: string;
}

interface RevokeMobilePushTokenInput {
  now?: Date;
  redis?: MobilePushRedis;
  sessionId: string;
}

interface MobilePushTokenRecord {
  platform: MobilePushPlatform;
  provider: MobilePushProvider;
  registeredAt: string;
  token: string;
  tokenFingerprint: string;
  userId: string;
}

function getMobilePushRedis(redis?: MobilePushRedis) {
  return (redis ?? getRedis()) as MobilePushRedis;
}

function hashMobilePushSessionId(sessionId: string) {
  return createHash("sha256").update(sessionId).digest("base64url");
}

export function getMobilePushTokenFingerprint(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export function getMobilePushTokenKey(sessionId: string) {
  return `${MOBILE_PUSH_TOKEN_KEY_PREFIX}${hashMobilePushSessionId(sessionId)}`;
}

export async function registerMobilePushToken({
  now = new Date(),
  platform,
  provider,
  redis,
  sessionId,
  token,
  userId,
}: RegisterMobilePushTokenInput): Promise<MobilePushRegistrationResponse> {
  const registeredAt = now.toISOString();
  const tokenFingerprint = getMobilePushTokenFingerprint(token);
  const record: MobilePushTokenRecord = {
    platform,
    provider,
    registeredAt,
    token,
    tokenFingerprint,
    userId,
  };

  await getMobilePushRedis(redis).set(
    getMobilePushTokenKey(sessionId),
    JSON.stringify(record),
    "EX",
    MOBILE_PUSH_TOKEN_TTL_SECONDS,
  );

  return MobilePushRegistrationResponseSchema.parse({
    provider,
    registered: true,
    registeredAt,
    tokenFingerprint,
  });
}

export async function revokeMobilePushToken({
  now = new Date(),
  redis,
  sessionId,
}: RevokeMobilePushTokenInput): Promise<MobilePushRegistrationRevokeResponse> {
  const deletedCount = await getMobilePushRedis(redis).del(getMobilePushTokenKey(sessionId));

  return MobilePushRegistrationRevokeResponseSchema.parse({
    revoked: deletedCount > 0,
    revokedAt: now.toISOString(),
  });
}
