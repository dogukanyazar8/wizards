import { prisma, type Prisma } from "@wizards/db";
import type { SecurityEvent as SecurityEventDto } from "@wizards/types";

import { getAnalyticsClientInfo, hashAnalyticsValue } from "@/lib/analytics/client-info";
import { logError } from "@/lib/logger";

/**
 * Ayarlar Ş3 §3 (K5) — "Son güvenlik etkinlikleri".
 *
 * The list is closed on purpose: a kind without a writer is a row the screen would promise and
 * never fill. Every member below has a caller in this stripe.
 *
 * Declared here rather than imported from `@wizards/db`, which does not re-export the enum.
 * `assertKindsMatchPrisma` below fails typecheck if the schema and this list drift apart.
 */
export const SECURITY_EVENT_KINDS = [
  "LOGIN_NEW_DEVICE",
  "PASSWORD_CHANGED",
  "FAILED_LOGIN",
  "TWO_FACTOR_ENABLED",
  "TWO_FACTOR_DISABLED",
  "SESSION_REVOKED",
  "RECOVERY_CODES_REGENERATED",
  "EMAIL_CHANGED",
] as const;

export type SecurityEventKind = (typeof SECURITY_EVENT_KINDS)[number];

type PrismaSecurityEventKind = Awaited<
  ReturnType<typeof prisma.securityEvent.findFirstOrThrow>
>["kind"];

/** Compile-time only: the two enums must stay the same set, in both directions. */
const assertKindsMatchPrisma: [
  SecurityEventKind extends PrismaSecurityEventKind ? true : false,
  PrismaSecurityEventKind extends SecurityEventKind ? true : false,
] = [true, true];
void assertKindsMatchPrisma;

/** Wire casing (`packages/types/src/settings.ts`), which is not the schema casing. */
const WIRE_KIND: Record<SecurityEventKind, SecurityEventDto["kind"]> = {
  EMAIL_CHANGED: "emailChanged",
  FAILED_LOGIN: "failedLogin",
  LOGIN_NEW_DEVICE: "loginNewDevice",
  PASSWORD_CHANGED: "passwordChanged",
  RECOVERY_CODES_REGENERATED: "recoveryCodesRegenerated",
  SESSION_REVOKED: "sessionRevoked",
  TWO_FACTOR_DISABLED: "twoFactorDisabled",
  TWO_FACTOR_ENABLED: "twoFactorEnabled",
};

export const SECURITY_EVENT_LIST_LIMIT = 10;

/** The row shape the service hands back; deliberately not the Prisma model. */
export type SecurityEventRecord = {
  createdAt: Date;
  id: string;
  kind: SecurityEventKind;
  location: string | null;
  userAgent: string | null;
};

export type RecordSecurityEventInput = {
  ip?: string | null;
  kind: SecurityEventKind;
  /**
   * A coarse guess, resolved the same way the session list resolves it: the CDN country header,
   * never a geo lookup on the address. `Konum bilgisi IP adresine göre tahmin edilir`.
   */
  location?: string | null;
  metadata?: Record<string, unknown>;
  userAgent?: string | null;
  userId: string;
};

export type SecurityEventStore = {
  create(input: {
    createdAt?: Date;
    ipHash: string | null;
    kind: SecurityEventKind;
    location: string | null;
    metadata: Record<string, unknown> | null;
    userAgent: string | null;
    userId: string;
  }): Promise<unknown>;
  list(userId: string, limit: number): Promise<SecurityEventRecord[]>;
};

export type SecurityEventDependencies = {
  hashIp: (value: string | null | undefined) => string | null;
  logError: typeof logError;
  store: SecurityEventStore;
};

const prismaSecurityEventStore: SecurityEventStore = {
  create: (input) =>
    prisma.securityEvent.create({
      data: {
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
        ipHash: input.ipHash,
        kind: input.kind,
        location: input.location,
        // Prisma types a Json column as its own `InputJsonObject`; the values this module
        // writes are plain string/number/boolean records built here, never caller-supplied JSON.
        ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonObject } : {}),
        userAgent: input.userAgent,
        userId: input.userId,
      },
      select: { id: true },
    }),
  list: (userId, limit) =>
    prisma.securityEvent.findMany({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, id: true, kind: true, location: true, userAgent: true },
      take: limit,
      where: { userId },
    }),
};

const defaultDependencies: SecurityEventDependencies = {
  // Identical scheme to `AdminAuditLog.ipHash`: sha256 over `${salt}:${value}`, salt read from
  // `ANALYTICS_HASH_SECRET` / `AUTH_SECRET` / `NEXTAUTH_SECRET`. The raw address is never stored.
  hashIp: hashAnalyticsValue,
  logError,
  store: prismaSecurityEventStore,
};

/** User agents are stored for the "Chrome · Windows" line; a novel is not a device name. */
const MAX_USER_AGENT_LENGTH = 256;
const MAX_LOCATION_LENGTH = 64;

function boundedText(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

/**
 * Never throws. A security log that can take the login flow down with it is a worse outage than
 * a missing row: the account owner would be locked out by the very feature meant to reassure
 * them. Callers deliberately do not `await` this for its result, only for its ordering.
 */
export async function recordSecurityEvent(
  input: RecordSecurityEventInput,
  dependencies: SecurityEventDependencies = defaultDependencies,
): Promise<void> {
  const userId = input.userId.trim();
  if (!userId) {
    return;
  }

  try {
    await dependencies.store.create({
      ipHash: dependencies.hashIp(input.ip),
      kind: input.kind,
      location: boundedText(input.location, MAX_LOCATION_LENGTH),
      metadata: input.metadata ?? null,
      userAgent: boundedText(input.userAgent, MAX_USER_AGENT_LENGTH),
      userId,
    });
  } catch (error) {
    dependencies.logError(`[security] Failed to record ${input.kind} security event`, error);
  }
}

export type SecurityEventHeaderSource = {
  get(name: string): string | null | undefined;
};

/**
 * The call form every request-scoped writer uses. `getAnalyticsClientInfo` already hashes the
 * address behind the trusted-proxy resolver, so the raw value never travels through this module.
 */
export async function recordSecurityEventFromHeaders(
  headers: SecurityEventHeaderSource | null | undefined,
  input: Omit<RecordSecurityEventInput, "ip" | "location" | "userAgent">,
  dependencies: SecurityEventDependencies = defaultDependencies,
): Promise<void> {
  let ipHash: string | null = null;
  let location: string | null = null;
  let userAgent: string | null = null;

  try {
    if (headers) {
      const info = getAnalyticsClientInfo(headers);
      ipHash = info.ipHash;
      location = info.countryCode;
      userAgent = headers.get("user-agent") ?? null;
    }
  } catch (error) {
    dependencies.logError("[security] Failed to read security event client info", error);
  }

  await recordSecurityEvent(
    { ...input, ip: null, location, userAgent },
    {
      ...dependencies,
      // The address was already hashed upstream with the same scheme; re-hashing a hash would
      // make two writers of the same event disagree about the value.
      hashIp: () => ipHash,
    },
  );
}

export async function listSecurityEvents(
  userId: string,
  limit: number = SECURITY_EVENT_LIST_LIMIT,
  dependencies: SecurityEventDependencies = defaultDependencies,
): Promise<SecurityEventRecord[]> {
  const bounded = Math.max(1, Math.min(Math.trunc(limit), SECURITY_EVENT_LIST_LIMIT));
  return dependencies.store.list(userId, bounded);
}

/**
 * Server sends enums and timestamps, never sentences: the row's wording lives in
 * `settings.security.event.*` on the client.
 */
export function serializeSecurityEvent(record: SecurityEventRecord): SecurityEventDto {
  return {
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    kind: WIRE_KIND[record.kind],
    location: record.location,
    userAgent: record.userAgent,
  };
}
