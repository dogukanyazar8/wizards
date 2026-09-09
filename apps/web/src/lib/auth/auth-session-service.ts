import { prisma } from "@wizards/db";
import type { AuthSessionsResponse } from "@wizards/types";
import { logError } from "@/lib/logger";
import { isDurableAuthSessionActive } from "@/lib/auth/session-revocation";
import {
  recordSecurityEvent,
  type RecordSecurityEventInput,
} from "@/lib/security/security-event-service";
import { disconnectAuthSessionSockets } from "@/lib/socket/runtime";

export type AuthSessionClientType = "WEB" | "DESKTOP" | "MOBILE" | "UNKNOWN";
export type AuthSessionDeviceType = "DESKTOP" | "MOBILE" | "TABLET" | "UNKNOWN";

export type AuthSessionRecord = {
  appVersion: string | null;
  browser: string | null;
  clientType: AuthSessionClientType;
  countryCode: string | null;
  createdAt: Date;
  deviceType: AuthSessionDeviceType;
  expiresAt: Date;
  id: string;
  lastSeenAt: Date;
  os: string | null;
  revokedAt: Date | null;
  userId: string;
};

export type AuthSessionMetadata = Pick<
  AuthSessionRecord,
  "appVersion" | "browser" | "clientType" | "countryCode" | "deviceType" | "os"
>;

/** The columns that decide whether a sign-in came from a machine this account has used before. */
export type AuthSessionDeviceFingerprint = Pick<
  AuthSessionRecord,
  "browser" | "clientType" | "deviceType" | "os"
>;

export interface AuthSessionStore {
  /**
   * Ayarlar Ş3 §3. How many *other* sessions this account has ever opened from the same
   * browser/OS/client combination. Optional so an in-memory store can opt out of the
   * `LOGIN_NEW_DEVICE` path entirely rather than fake a device history it does not keep.
   */
  countKnownDevices?(
    userId: string,
    fingerprint: AuthSessionDeviceFingerprint,
    excludeSessionId: string,
  ): Promise<number>;
  find(id: string): Promise<AuthSessionRecord | null>;
  listActive(userId: string, now: Date, limit: number): Promise<AuthSessionRecord[]>;
  revoke(id: string, userId: string, revokedAt: Date): Promise<AuthSessionRecord | null>;
  revokeOthers(
    userId: string,
    currentSessionId: string,
    revokedAt: Date,
  ): Promise<AuthSessionRecord[]>;
  upsert(record: AuthSessionRecord): Promise<AuthSessionRecord>;
}

const authSessionSelect = {
  appVersion: true,
  browser: true,
  clientType: true,
  countryCode: true,
  createdAt: true,
  deviceType: true,
  expiresAt: true,
  id: true,
  lastSeenAt: true,
  os: true,
  revokedAt: true,
  userId: true,
} as const;

export const prismaAuthSessionStore: AuthSessionStore = {
  countKnownDevices: (userId, fingerprint, excludeSessionId) =>
    prisma.authSession.count({
      where: {
        browser: fingerprint.browser,
        clientType: fingerprint.clientType,
        deviceType: fingerprint.deviceType,
        id: { not: excludeSessionId },
        os: fingerprint.os,
        userId,
      },
    }),
  find: (id) => prisma.authSession.findUnique({ select: authSessionSelect, where: { id } }),
  listActive: (userId, now, limit) =>
    prisma.authSession.findMany({
      orderBy: { lastSeenAt: "desc" },
      select: authSessionSelect,
      take: limit,
      where: { expiresAt: { gt: now }, revokedAt: null, userId },
    }),
  async revoke(id, userId, revokedAt) {
    const updated = await prisma.authSession.updateMany({
      data: { revokedAt },
      where: { id, revokedAt: null, userId },
    });
    return updated.count === 0
      ? null
      : prisma.authSession.findUnique({ select: authSessionSelect, where: { id } });
  },
  async revokeOthers(userId, currentSessionId, revokedAt) {
    const targets = await prisma.authSession.findMany({
      select: authSessionSelect,
      where: {
        expiresAt: { gt: revokedAt },
        id: { not: currentSessionId },
        revokedAt: null,
        userId,
      },
    });
    if (targets.length === 0) return [];
    await prisma.authSession.updateMany({
      data: { revokedAt },
      where: { id: { in: targets.map(({ id }) => id) }, revokedAt: null, userId },
    });
    return targets.map((record) => ({ ...record, revokedAt }));
  },
  upsert: (record) =>
    prisma.authSession.upsert({
      create: record,
      select: authSessionSelect,
      update: {
        ...(record.appVersion ? { appVersion: record.appVersion } : {}),
        ...(record.browser ? { browser: record.browser } : {}),
        ...(record.clientType !== "UNKNOWN" ? { clientType: record.clientType } : {}),
        ...(record.countryCode ? { countryCode: record.countryCode } : {}),
        ...(record.deviceType !== "UNKNOWN" ? { deviceType: record.deviceType } : {}),
        expiresAt: record.expiresAt,
        lastSeenAt: record.lastSeenAt,
        ...(record.os ? { os: record.os } : {}),
      },
      where: { id: record.id },
    }),
};

function safeText(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeMetadata(metadata: AuthSessionMetadata | null): AuthSessionMetadata {
  const countryCode = metadata?.countryCode?.trim().toUpperCase() ?? "";
  return {
    appVersion: safeText(metadata?.appVersion, 32),
    browser: safeText(metadata?.browser, 128),
    clientType: metadata?.clientType ?? "UNKNOWN",
    countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : null,
    deviceType: metadata?.deviceType ?? "UNKNOWN",
    os: safeText(metadata?.os, 128),
  };
}

export type SecurityEventRecorder = (input: RecordSecurityEventInput) => Promise<void>;

/**
 * Ayarlar Ş3 §3. `Yeni cihazdan giriş` fires when a *created* session is the first this account
 * has ever opened from that browser/OS/client combination — not on every sign-in, which would
 * make the row meaningless, and not on the touch path, which runs every minute.
 *
 * The write is fire-and-forget by contract: `recordSecurityEvent` swallows its own failures, so
 * a full security-log outage cannot stop anyone from signing in.
 */
async function recordNewDeviceLogin(
  record: AuthSessionRecord,
  store: AuthSessionStore,
  recordEvent: SecurityEventRecorder,
) {
  if (!store.countKnownDevices) {
    return;
  }

  const knownDevices = await store.countKnownDevices(
    record.userId,
    {
      browser: record.browser,
      clientType: record.clientType,
      deviceType: record.deviceType,
      os: record.os,
    },
    record.id,
  );

  if (knownDevices > 0) {
    return;
  }

  await recordEvent({
    kind: "LOGIN_NEW_DEVICE",
    location: record.countryCode,
    userAgent: record.browser,
    userId: record.userId,
  });
}

export async function ensureAuthSession(
  input: {
    expiresAt: Date;
    id: string;
    metadata: AuthSessionMetadata | null;
    now?: Date;
    recordEvent?: SecurityEventRecorder;
    userId: string;
  },
  store: AuthSessionStore = prismaAuthSessionStore,
) {
  const now = input.now ?? new Date();
  const record = await store.upsert({
    ...normalizeMetadata(input.metadata),
    createdAt: now,
    expiresAt: input.expiresAt,
    id: input.id,
    lastSeenAt: now,
    revokedAt: null,
    userId: input.userId,
  });

  // `upsert` cannot report which branch it took, but `createdAt` can: an update keeps the
  // original instant, a create echoes back the one passed in. Cheaper than a read before write
  // on a path the JWT callback runs on every request.
  if (record.createdAt.getTime() === now.getTime()) {
    try {
      await recordNewDeviceLogin(record, store, input.recordEvent ?? recordSecurityEvent);
    } catch (error) {
      logError("[auth] Failed to evaluate new-device login", error);
    }
  }

  return record;
}

export async function listAuthSessions(
  userId: string,
  currentSessionId: string,
  options: { now?: Date; store?: AuthSessionStore } = {},
): Promise<AuthSessionsResponse> {
  const rows = await (options.store ?? prismaAuthSessionStore).listActive(
    userId,
    options.now ?? new Date(),
    100,
  );
  return {
    sessions: rows.map((row) => ({
      appVersion: row.appVersion,
      browser: row.browser,
      clientType: row.clientType,
      countryCode: row.countryCode,
      createdAt: row.createdAt.toISOString(),
      current: row.id === currentSessionId,
      deviceType: row.deviceType,
      expiresAt: row.expiresAt.toISOString(),
      id: row.id,
      lastSeenAt: row.lastSeenAt.toISOString(),
      os: row.os,
    })),
  };
}

export async function isAuthSessionActive(
  userId: string,
  sessionId: string,
  options: { now?: Date; store?: AuthSessionStore } = {},
): Promise<boolean | null> {
  const row = await (options.store ?? prismaAuthSessionStore).find(sessionId);
  if (!row) return null;
  return isDurableAuthSessionActive(row, userId, options.now ?? new Date());
}

type AuthSessionRevocationOptions = {
  disconnectSockets?: (sessionId: string) => Promise<void> | void;
  now?: Date;
  /**
   * Ayarlar Ş3 §4. Pass a no-op when the caller already logs a more specific event for the same
   * action — a password change writes `PASSWORD_CHANGED`, and a second `SESSION_REVOKED` row for
   * the same click would pad the log without adding a fact.
   */
  recordEvent?: SecurityEventRecorder;
  store?: AuthSessionStore;
};

async function notifyRevokedAuthSessions(
  sessions: AuthSessionRecord[],
  disconnectSockets: (sessionId: string) => Promise<void> | void,
) {
  await Promise.all(
    sessions.map(async ({ id }) => {
      try {
        await disconnectSockets(id);
      } catch (error) {
        logError(`[auth] Failed to disconnect revoked session ${id}`, error);
      }
    }),
  );
}

export async function revokeAuthSession(
  userId: string,
  sessionId: string,
  options: AuthSessionRevocationOptions = {},
) {
  const revokedSession = await (options.store ?? prismaAuthSessionStore).revoke(
    sessionId,
    userId,
    options.now ?? new Date(),
  );
  if (revokedSession) {
    await notifyRevokedAuthSessions(
      [revokedSession],
      options.disconnectSockets ?? disconnectAuthSessionSockets,
    );
    await (options.recordEvent ?? recordSecurityEvent)({
      kind: "SESSION_REVOKED",
      location: revokedSession.countryCode,
      metadata: { revokedCount: 1, scope: "single" },
      userAgent: revokedSession.browser,
      userId,
    });
  }
  return revokedSession;
}

/**
 * Tuzak #13. The current session is excluded by construction — the store filters on
 * `id != currentSessionId` and no account-wide revocation marker is advanced here — so
 * "Diğerlerini kapat" can never sign the caller out of the window they clicked it in.
 */
export async function revokeOtherAuthSessions(
  userId: string,
  currentSessionId: string,
  options: AuthSessionRevocationOptions = {},
) {
  const revokedSessions = await (options.store ?? prismaAuthSessionStore).revokeOthers(
    userId,
    currentSessionId,
    options.now ?? new Date(),
  );
  await notifyRevokedAuthSessions(
    revokedSessions,
    options.disconnectSockets ?? disconnectAuthSessionSockets,
  );
  if (revokedSessions.length > 0) {
    await (options.recordEvent ?? recordSecurityEvent)({
      kind: "SESSION_REVOKED",
      metadata: { revokedCount: revokedSessions.length, scope: "others" },
      userId,
    });
  }
  return revokedSessions;
}
