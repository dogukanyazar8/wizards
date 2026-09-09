import { createHash } from "node:crypto";

import { prisma } from "@wizards/db";
import {
  MobilePushRegistrationRevokeResponseSchema,
  MobilePushRegistrationResponseSchema,
  type MobilePushPlatform,
  type MobilePushProvider,
  type MobilePushRegistrationRevokeResponse,
  type MobilePushRegistrationResponse,
  type NotificationPrefs,
} from "@wizards/types";

import { isNotificationAllowed, type NotificationKindKey } from "@/lib/notifications/prefs-policy";
import {
  listNotificationPrefs,
  readPrefs,
  type NotificationSettingsDependencies,
} from "@/lib/notifications/prefs-service";

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

/**
 * Ayarlar Ş1 §5 — the `delivery.push` gate.
 *
 * K12's promise in one function: "mobil push kapalı" has to actually silence the phone, not just
 * be stored. It sits **before** the token read on purpose — the acceptance criterion is that a
 * recipient with push off costs zero token lookups, and a filter applied after the read would
 * still walk every device row of every recipient.
 *
 * Quiet hours, level and the per-type switches are all consulted here too, through the one
 * policy module, so the push channel cannot drift from the toast channel about what "important"
 * means.
 */
export interface PushRecipientGateOptions {
  /** Injected in tests; production reads the row through `prefs-service`. */
  loadPrefs?: (userIds: readonly string[]) => Promise<Map<string, NotificationPrefs>>;
  now?: Date;
  prefsDependencies?: NotificationSettingsDependencies;
}

export async function filterPushEligibleUserIds(
  userIds: readonly string[],
  kind: NotificationKindKey,
  options: PushRecipientGateOptions = {},
): Promise<Set<string>> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) {
    return new Set();
  }

  const load =
    options.loadPrefs ??
    ((ids: readonly string[]) => listNotificationPrefs(ids, options.prefsDependencies));
  const prefs = await load(uniqueIds);
  const at = options.now ?? new Date();
  const eligible = new Set<string>();

  for (const userId of uniqueIds) {
    const recipient = readPrefs(prefs, userId);
    if (!recipient.delivery.push) {
      continue;
    }

    if (isNotificationAllowed(recipient, kind, at).allowed) {
      eligible.add(userId);
    }
  }

  return eligible;
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
