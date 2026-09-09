import bcrypt from "bcryptjs";
import { prisma } from "@wizards/db";

import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedisRate } from "@/lib/redis";
import {
  createNetworkRateLimitIdentity,
  createSubjectRateLimitIdentity,
  type ClientIpHeaderSource,
} from "@/lib/security/client-ip";

/**
 * Ayarlar Ş3 §1 — the password change both surfaces run through.
 *
 * The mobile endpoint owned this logic first. It moved here **unchanged**: the same order
 * (load → reject dead accounts → compare → hash → save → revoke), the same failure set, the same
 * injection points. What differs between the two callers is the wrapper — mobile's rate limit
 * bucket and its `INVALID_CREDENTIALS` wording, web's three separate error codes — so the
 * wrapper is where those live, not here.
 */

export const PASSWORD_HASH_ROUNDS = 12;

/** SPEC §5.1 help text: `En az 10 karakter, bir sayı ve bir büyük harf gerekir.` */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 100;

export const PASSWORD_POLICY_RULES = [
  "length",
  "digit",
  "uppercase",
  "maxLength",
  "reused",
] as const;
export type PasswordPolicyRule = (typeof PASSWORD_POLICY_RULES)[number];

/**
 * Which rules a candidate fails, in a stable order. The endpoint returns the list rather than a
 * sentence: the wording is `settings.security.password.rule.*` on the client, not here.
 */
export function checkPasswordPolicy(
  password: string,
  options: { currentPassword?: string } = {},
): PasswordPolicyRule[] {
  const failed: PasswordPolicyRule[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    failed.push("length");
  }
  if (!/\d/.test(password)) {
    failed.push("digit");
  }
  if (!/\p{Lu}/u.test(password)) {
    failed.push("uppercase");
  }
  // bcrypt silently truncates at 72 bytes; a longer password would give a false sense of length.
  if (password.length > PASSWORD_MAX_LENGTH || Buffer.byteLength(password, "utf8") > 72) {
    failed.push("maxLength");
  }
  if (options.currentPassword !== undefined && password === options.currentPassword) {
    failed.push("reused");
  }

  return failed;
}

export type AccountPasswordUser = {
  deletedAt: Date | null;
  isBanned: boolean;
  passwordHash: string | null;
};

export type ChangeAccountPasswordFailure =
  "invalid_current_password" | "password_unavailable" | "user_not_found";

export type ChangeAccountPasswordResult =
  { changedAt: Date; ok: true } | { ok: false; reason: ChangeAccountPasswordFailure };

export type ChangeAccountPasswordDependencies = {
  comparePassword(password: string, passwordHash: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
  loadUser(userId: string): Promise<AccountPasswordUser | null>;
  now(): Date;
  /**
   * Mobile advances the account-wide revocation marker here; web omits this entirely and revokes
   * the *other* durable sessions afterwards, so the caller stays signed in (tuzak #13). Optional
   * rather than a no-op default: a caller that must not touch the marker should not be able to
   * touch it by forgetting to override something.
   */
  revokeSessions?(userId: string, now: Date): Promise<unknown>;
  savePassword(userId: string, passwordHash: string, now: Date): Promise<unknown>;
};

export async function loadAccountPasswordUser(userId: string): Promise<AccountPasswordUser | null> {
  return prisma.user.findUnique({
    select: { deletedAt: true, isBanned: true, passwordHash: true },
    where: { id: userId },
  });
}

/** Mobile's write: the password plus the account-wide revocation marker, in one update. */
export async function saveAccountPasswordWithGlobalRevocation(
  userId: string,
  passwordHash: string,
  now: Date,
) {
  return prisma.user.update({
    data: { passwordHash, sessionsRevokedAfter: now },
    select: { id: true },
    where: { id: userId },
  });
}

/**
 * Web's write: the password alone. Advancing `sessionsRevokedAfter` here would revoke the
 * session that is doing the changing — the marker compares `sessionStartedAt <= revokedAfter`,
 * and the current session always started before now.
 */
export async function saveAccountPassword(userId: string, passwordHash: string) {
  return prisma.user.update({
    data: { passwordHash },
    select: { id: true },
    where: { id: userId },
  });
}

export const defaultChangeAccountPasswordDependencies: ChangeAccountPasswordDependencies = {
  comparePassword: (password, passwordHash) => bcrypt.compare(password, passwordHash),
  hashPassword: (password) => bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
  loadUser: loadAccountPasswordUser,
  now: () => new Date(),
  savePassword: saveAccountPasswordWithGlobalRevocation,
};

export async function changeAccountPassword(
  input: { currentPassword: string; newPassword: string; userId: string },
  dependencies: ChangeAccountPasswordDependencies,
): Promise<ChangeAccountPasswordResult> {
  const user = await dependencies.loadUser(input.userId);

  if (!user || user.deletedAt || user.isBanned) {
    return { ok: false, reason: "user_not_found" };
  }

  if (!user.passwordHash) {
    return { ok: false, reason: "password_unavailable" };
  }

  if (!(await dependencies.comparePassword(input.currentPassword, user.passwordHash))) {
    return { ok: false, reason: "invalid_current_password" };
  }

  const now = dependencies.now();
  await dependencies.savePassword(
    input.userId,
    await dependencies.hashPassword(input.newPassword),
    now,
  );
  await dependencies.revokeSessions?.(input.userId, now);

  return { changedAt: now, ok: true };
}

// ---------------------------------------------------------------------------
// Hız sınırı — `lib/auth/request-rate-limits.ts` deseni, anahtar `account:password`
// ---------------------------------------------------------------------------

const PASSWORD_RATE_LIMIT_SCOPE = "account:password";
const PASSWORD_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const PASSWORD_REQUEST_LIMITS = { network: 30, subject: 10 } as const;
/**
 * A wrong current password spends a second, tighter budget on top of the request budget. Without
 * it the endpoint is an authenticated password oracle: ten guesses per window is a lot of guesses
 * if only the request bucket counts.
 */
const PASSWORD_FAILURE_LIMITS = { network: 20, subject: 5 } as const;

export type PasswordRateLimitDependencies = {
  checkRateLimit: typeof checkRateLimit;
  getRedisRate: typeof getRedisRate;
  logError: typeof logError;
};

const defaultRateLimitDependencies: PasswordRateLimitDependencies = {
  checkRateLimit,
  getRedisRate,
  logError,
};

export type PasswordRateLimitSubject = {
  headers: ClientIpHeaderSource;
  userId: string;
};

function passwordRateLimitKeys(subject: PasswordRateLimitSubject, suffix: string) {
  const network = createNetworkRateLimitIdentity({ headers: subject.headers });
  const account = createSubjectRateLimitIdentity("user", subject.userId);

  return [
    `rate:auth:${PASSWORD_RATE_LIMIT_SCOPE}:${suffix}:network:${network}`,
    `rate:auth:${PASSWORD_RATE_LIMIT_SCOPE}:${suffix}:subject:${account}`,
  ];
}

async function consumeBudget(
  subject: PasswordRateLimitSubject,
  suffix: string,
  limits: { network: number; subject: number },
  dependencies: PasswordRateLimitDependencies,
) {
  const [networkKey, subjectKey] = passwordRateLimitKeys(subject, suffix);

  try {
    const redis = dependencies.getRedisRate();
    const results = await Promise.all([
      dependencies.checkRateLimit(
        redis,
        String(networkKey),
        limits.network,
        PASSWORD_RATE_LIMIT_WINDOW_SECONDS,
      ),
      dependencies.checkRateLimit(
        redis,
        String(subjectKey),
        limits.subject,
        PASSWORD_RATE_LIMIT_WINDOW_SECONDS,
      ),
    ]);
    return results.every(Boolean);
  } catch (error) {
    // Fail closed: an unavailable limiter must not turn into an unlimited one on the endpoint
    // that changes a password.
    dependencies.logError(`[auth-rate-limit] ${PASSWORD_RATE_LIMIT_SCOPE} unavailable`, error);
    return false;
  }
}

export function checkPasswordChangeRateLimit(
  subject: PasswordRateLimitSubject,
  dependencies: PasswordRateLimitDependencies = defaultRateLimitDependencies,
) {
  return consumeBudget(subject, "request", PASSWORD_REQUEST_LIMITS, dependencies);
}

export function recordPasswordChangeFailure(
  subject: PasswordRateLimitSubject,
  dependencies: PasswordRateLimitDependencies = defaultRateLimitDependencies,
) {
  return consumeBudget(subject, "failure", PASSWORD_FAILURE_LIMITS, dependencies);
}
