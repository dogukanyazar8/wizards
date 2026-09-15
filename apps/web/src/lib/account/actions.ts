"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { UserStatus, prisma } from "@wizards/db";
import { auth, normalizeAuthEmail, unstable_update } from "@/auth";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  formatManualEntryKey,
  getRecoveryCodeStatus,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
  type ConfirmTwoFactorSetupResult,
  type StartTwoFactorSetupResult,
  type TwoFactorFailureResult,
} from "@/lib/auth/two-factor";
import {
  recordSecurityEventFromHeaders,
  type SecurityEventKind,
} from "@/lib/security/security-event-service";
import {
  broadcastUserProfileUpdate,
  mapVisiblePresenceStatus,
  updateAccountPresence,
  updateAccountProfile,
} from "@/lib/account/service";
import { ApiError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { isExplicitE2ETestMode } from "@/lib/e2e/mode";
import { toVisiblePresence } from "@/lib/home/focus";
import { broadcastHomePresence } from "@/lib/home/presence-service";
import { logError } from "@/lib/logger";
import { isDndDuration, planDndWrite, type DndDuration } from "@/lib/presence/dnd";
import type { FriendPresenceStatus } from "@/lib/friends/types";

const UpdateAccountSettingsSchema = z.object({
  displayName: z.string().trim().max(60, "settings.account.errors.displayNameTooLong"),
  email: z.string().trim().email("validation.email.invalid"),
  status: z.nativeEnum(UserStatus),
  username: z
    .string()
    .trim()
    .min(2, "validation.username.min")
    .max(32, "validation.username.max")
    .regex(/^[a-zA-Z0-9_]+$/, "validation.username.pattern"),
});

const UpdateAccountAvatarSchema = z.object({
  avatarUrl: z.string().trim().max(2048).nullable(),
});

export type AccountSettingsState = {
  avatarUrl: string | null;
  displayName: string | null;
  email: string;
  emailVerified: boolean;
  id: string;
  status: UserStatus;
  twoFactorEnabled: boolean;
  username: string;
};

type AccountSettingsField = "displayName" | "email" | "status" | "username";

export type UpdateAccountSettingsResult = {
  error?: string;
  fieldErrors?: Partial<Record<AccountSettingsField, string>>;
  success: boolean;
  user?: AccountSettingsState;
};

export type UpdateAccountAvatarResult = {
  error?: string;
  success: boolean;
  user?: AccountSettingsState;
};

const UpdatePresenceStatusSchema = z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]);

export type UpdatePresenceStatusResult = {
  error?: string;
  status?: FriendPresenceStatus;
  success: boolean;
};

export type StartTwoFactorSetupActionResult =
  | StartTwoFactorSetupResult
  | {
      error: string;
      success: false;
    };

export type ConfirmTwoFactorSetupActionResult =
  | ConfirmTwoFactorSetupResult
  | {
      error: string;
      success: false;
    };

export type DisableTwoFactorActionResult =
  | {
      success: true;
    }
  | {
      error: string;
      retryAfterSeconds?: number;
      success: false;
    };

export type TwoFactorActionFailure = {
  error: string;
  retryAfterSeconds?: number;
  success: false;
};

/** Ş3 §2 — URI plus manual key. No image: the QR is rendered client-side from `otpauthUri`. */
export type BeginTwoFactorSetupActionResult =
  | {
      manualEntryKey: string;
      otpauthUri: string;
      success: true;
    }
  | TwoFactorActionFailure;

export type RecoveryCodeStatusActionResult =
  | {
      success: true;
      total: number;
      unused: number;
    }
  | TwoFactorActionFailure;

export type RegenerateRecoveryCodesActionResult =
  | {
      recoveryCodes: string[];
      success: true;
    }
  | TwoFactorActionFailure;

function mapUserToAccountState(user: {
  avatarUrl: string | null;
  displayName: string | null;
  email: string;
  emailVerified: boolean;
  id: string;
  status: UserStatus;
  twoFactorEnabled: boolean;
  username: string;
}): AccountSettingsState {
  return {
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified,
    id: user.id,
    status: user.status,
    twoFactorEnabled: user.twoFactorEnabled,
    username: user.username,
  };
}

function mapTwoFactorError(error: TwoFactorFailureResult["error"]) {
  switch (error) {
    case "already_enabled":
      return "settings.account.twoFactor.errors.alreadyEnabled";
    case "invalid_code":
      return "settings.account.twoFactor.errors.invalidCode";
    case "not_enabled":
      return "settings.account.twoFactor.errors.notEnabled";
    case "not_found":
      return "settings.account.twoFactor.errors.unavailable";
    case "rate_limited":
      return "settings.account.twoFactor.errors.rateLimited";
    case "setup_required":
      return "settings.account.twoFactor.errors.setupRequired";
    case "verification_unavailable":
      return "settings.account.twoFactor.errors.unavailable";
  }
}

/**
 * Ayarlar Ş3 §3. Request-scoped so the row can carry the same country guess and device string the
 * session list shows. Never awaited for a result the caller acts on: `recordSecurityEvent`
 * swallows its own failures, and turning off 2FA must not fail because the log is unavailable.
 */
async function recordAccountSecurityEvent(kind: SecurityEventKind, userId: string) {
  await recordSecurityEventFromHeaders(await headers().catch(() => null), { kind, userId });
}

function mapTwoFactorActionFailure(result: TwoFactorFailureResult) {
  return {
    error: mapTwoFactorError(result.error),
    ...(result.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: result.retryAfterSeconds }),
    success: false,
  } as const;
}

function isTrustedAvatarUrl(value: string | null) {
  if (value === null) {
    return true;
  }

  if (
    isExplicitE2ETestMode({
      allowProductionBuild: process.env.E2E_ALLOW_PRODUCTION_BUILD,
      nodeEnv: process.env.NODE_ENV,
      testMode: process.env.E2E_TEST_MODE,
    }) &&
    /^data:image\/(?:jpeg|png|webp);base64,/i.test(value)
  ) {
    return true;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      (hostname === "utfs.io" ||
        hostname === "ufs.sh" ||
        hostname.endsWith(".ufs.sh") ||
        hostname === "uploadthing.com" ||
        hostname.endsWith(".uploadthing.com"))
    );
  } catch {
    return false;
  }
}

export async function updateAccountSettingsAction(
  payload: AccountSettingsState,
): Promise<UpdateAccountSettingsResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: "auth.login.signInUnavailable",
      success: false,
    };
  }

  const parsed = UpdateAccountSettingsSchema.safeParse({
    ...payload,
    email: normalizeAuthEmail(payload.email),
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<AccountSettingsField, string>> = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field as AccountSettingsField]) {
        fieldErrors[field as AccountSettingsField] = issue.message;
      }
    }

    return {
      fieldErrors,
      success: false,
    };
  }

  let updatedUser;
  try {
    updatedUser = await updateAccountProfile(session.user.id, parsed.data);
  } catch (error) {
    if (error instanceof ApiError && error.code === "EMAIL_CHANGE_REQUIRED") {
      return {
        success: false,
        fieldErrors: { email: "settings.contact.error.EMAIL_CHANGE_REQUIRED" },
      };
    }
    if (error instanceof ApiError && error.code === "EMAIL_TAKEN") {
      return {
        fieldErrors: { email: "settings.account.errors.emailTaken" },
        success: false,
      };
    }
    if (error instanceof ApiError && error.code === "USERNAME_TAKEN") {
      return {
        fieldErrors: { username: "settings.account.errors.usernameTaken" },
        success: false,
      };
    }
    throw error;
  }

  await unstable_update({
    user: {
      ...session.user,
      displayName: updatedUser.displayName,
      email: updatedUser.email,
      username: updatedUser.username,
    },
  });

  return {
    success: true,
    user: mapUserToAccountState(updatedUser),
  };
}

export async function updateAccountAvatarAction(
  avatarUrl: string | null,
): Promise<UpdateAccountAvatarResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: "auth.login.signInUnavailable",
      success: false,
    };
  }

  const parsed = UpdateAccountAvatarSchema.safeParse({ avatarUrl });
  if (!parsed.success || !isTrustedAvatarUrl(parsed.data.avatarUrl)) {
    return {
      error: "settings.account.avatar.errors.invalid",
      success: false,
    };
  }

  const updatedUser = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      avatarUrl: parsed.data.avatarUrl,
    },
    select: {
      avatarUrl: true,
      customStatus: true,
      displayName: true,
      email: true,
      emailVerified: true,
      id: true,
      status: true,
      twoFactorEnabled: true,
      username: true,
    },
  });

  await unstable_update({
    user: {
      ...session.user,
      avatarUrl: updatedUser.avatarUrl,
      image: updatedUser.avatarUrl,
    },
  });

  await broadcastUserProfileUpdate({
    avatarUrl: updatedUser.avatarUrl,
    customStatus: updatedUser.customStatus,
    displayName: updatedUser.displayName,
    status: mapVisiblePresenceStatus(updatedUser.status),
    userId: session.user.id,
    username: updatedUser.username,
  });

  return {
    success: true,
    user: mapUserToAccountState(updatedUser),
  };
}

export async function startTwoFactorSetupAction(): Promise<StartTwoFactorSetupActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: "auth.login.signInUnavailable",
      success: false,
    };
  }

  try {
    const result = await startTwoFactorSetup(session.user.id);
    return result.success ? result : mapTwoFactorActionFailure(result);
  } catch (error) {
    logError("[account] Two-factor setup failed", error);
    return {
      error: "settings.account.twoFactor.errors.unavailable",
      success: false,
    };
  }
}

export async function confirmTwoFactorSetupAction(
  code: string,
): Promise<ConfirmTwoFactorSetupActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: "auth.login.signInUnavailable",
      success: false,
    };
  }

  try {
    const result = await confirmTwoFactorSetup({
      code,
      userId: session.user.id,
    });
    if (result.success) {
      await recordAccountSecurityEvent("TWO_FACTOR_ENABLED", session.user.id);
      return result;
    }
    return mapTwoFactorActionFailure(result);
  } catch (error) {
    logError("[account] Two-factor confirmation failed", error);
    return {
      error: "settings.account.twoFactor.errors.unavailable",
      success: false,
    };
  }
}

export async function disableTwoFactorAction(input: {
  code: string;
  password: string;
}): Promise<DisableTwoFactorActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: "auth.login.signInUnavailable",
      success: false,
    };
  }

  try {
    await enforceApiRateLimit(session.user.id, "auth:two-factor-disable");
    // Ş3 §2: turning 2FA off re-authenticates with the account password **and** a live second
    // factor. `disableTwoFactor` rejects either failure through one shared tracker and one shared
    // result, so this endpoint cannot be read as a password oracle.
    const result = await disableTwoFactor({
      code: input.code,
      password: input.password,
      userId: session.user.id,
    });
    if (result.success) {
      await recordAccountSecurityEvent("TWO_FACTOR_DISABLED", session.user.id);
      return result;
    }
    return mapTwoFactorActionFailure(result);
  } catch (error) {
    if (error instanceof ApiError && error.code === "RATE_LIMITED") {
      return {
        error: "settings.account.twoFactor.errors.rateLimited",
        success: false,
      };
    }
    logError("[account] Two-factor disable failed", error);
    return {
      error: "settings.account.twoFactor.errors.unavailable",
      success: false,
    };
  }
}

/**
 * Ayarlar Ş3 §2 — the setup material the Güvenlik satırı needs.
 *
 * The `otpauth://` URI and the grouped manual key, and nothing else: the QR image is drawn on the
 * client from this URI. `startTwoFactorSetupAction` above still returns a data-URL image for the
 * old settings panel, which Ş13 deletes along with it.
 */
export async function beginTwoFactorSetupAction(): Promise<BeginTwoFactorSetupActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: "auth.login.signInUnavailable",
      success: false,
    };
  }

  try {
    const result = await startTwoFactorSetup(session.user.id);
    if (!result.success) {
      return mapTwoFactorActionFailure(result);
    }

    return {
      manualEntryKey: formatManualEntryKey(result.manualEntryKey),
      otpauthUri: result.otpauthUri,
      success: true,
    };
  } catch (error) {
    logError("[account] Two-factor setup failed", error);
    return {
      error: "settings.account.twoFactor.errors.unavailable",
      success: false,
    };
  }
}

/** `10 kod · 8 tanesi kullanılmadı`. Two numbers, no code material. */
export async function getRecoveryCodeStatusAction(): Promise<RecoveryCodeStatusActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: "auth.login.signInUnavailable",
      success: false,
    };
  }

  try {
    const result = await getRecoveryCodeStatus(session.user.id);
    return result.success ? result : mapTwoFactorActionFailure(result);
  } catch (error) {
    logError("[account] Recovery code status failed", error);
    return {
      error: "settings.account.twoFactor.errors.unavailable",
      success: false,
    };
  }
}

/**
 * `Yenile`. Same re-authentication pair as disabling 2FA, because a fresh set of ten codes is a
 * permanent bypass of the second factor if it reaches the wrong person. The plaintext is returned
 * exactly once — the store keeps only sha256 hashes, so `Görüntüle` cannot bring it back later.
 */
export async function regenerateRecoveryCodesAction(input: {
  code: string;
  password: string;
}): Promise<RegenerateRecoveryCodesActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: "auth.login.signInUnavailable",
      success: false,
    };
  }

  try {
    await enforceApiRateLimit(session.user.id, "account:recovery-codes");
    const result = await regenerateRecoveryCodes({
      code: input.code,
      password: input.password,
      userId: session.user.id,
    });
    return result.success ? result : mapTwoFactorActionFailure(result);
  } catch (error) {
    if (error instanceof ApiError && error.code === "RATE_LIMITED") {
      return {
        error: "settings.account.twoFactor.errors.rateLimited",
        success: false,
      };
    }
    logError("[account] Recovery code regeneration failed", error);
    return {
      error: "settings.account.twoFactor.errors.unavailable",
      success: false,
    };
  }
}

export async function updatePresenceStatusAction(
  status: FriendPresenceStatus,
): Promise<UpdatePresenceStatusResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: "auth.login.signInUnavailable",
      success: false,
    };
  }

  const parsed = UpdatePresenceStatusSchema.safeParse(status);

  if (!parsed.success) {
    return {
      error: "settings.account.errors.save",
      success: false,
    };
  }

  try {
    const presence = await updateAccountPresence(session.user.id, parsed.data);
    return {
      status: presence.status,
      success: true,
    };
  } catch {
    return {
      error: "settings.account.errors.save",
      success: false,
    };
  }
}

/**
 * Ayarlar Ş12 §2 / K8 — kullanıcı barı menüsündeki "Rahatsız Etmeyin" anahtarı ve süre çipleri.
 *
 * `updatePresenceStatusAction`'ın yanında ve ondan **ayrı** duruyor, çünkü durum listesi tek
 * kolon yazar; bu dört kolon yazar (`status`, `statusExpiresAt`, `statusFocusMinutes`,
 * `statusRestoreTo`). İkisini tek imzada birleştirmek, durum listesinin yolunu da
 * değiştirirdi — tasarımın "durum satırı aynen kalır" kuralı tam olarak bunu yasaklıyor.
 *
 * Karar `planDndWrite` içinde, saf. Buradaki iş oturumu doğrulamak, satırı okumak, planı
 * yazmak ve yayını tetiklemek. Süreyi bu eylem **saymaz**: `statusExpiresAt` mutlak bir andır
 * ve pencereyi zaten `sweepExpiredFocus` ile okuma anındaki `resolveFocusState` kapatıyor.
 */
export async function updatePresenceDndAction(
  duration: DndDuration | null,
): Promise<UpdatePresenceStatusResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: "auth.login.signInUnavailable",
      success: false,
    };
  }

  if (duration !== null && !isDndDuration(duration)) {
    return {
      error: "settings.account.errors.save",
      success: false,
    };
  }

  try {
    const userId = session.user.id;
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        statusExpiresAt: true,
        statusFocusMinutes: true,
        statusRestoreTo: true,
      },
    });

    if (!row) {
      return {
        error: "settings.account.errors.save",
        success: false,
      };
    }

    const plan = planDndWrite({ duration, now: new Date(), row });

    // Yazacak bir şey yoksa yayın da yok: aynı çipe ikinci kez basmak her arkadaşın soketini
    // boşuna uyandırmamalı.
    if (plan.changed) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          status: plan.data.status as UserStatus,
          statusExpiresAt: plan.data.statusExpiresAt,
          statusFocusMinutes: plan.data.statusFocusMinutes,
          statusRestoreTo: plan.data.statusRestoreTo as UserStatus | null,
        },
      });
      await broadcastHomePresence({ status: plan.data.status, userId });
    }

    return {
      status: toVisiblePresence(plan.data.status) as FriendPresenceStatus,
      success: true,
    };
  } catch (error) {
    logError("[account] DND presence write failed", error);
    return {
      error: "settings.account.errors.save",
      success: false,
    };
  }
}
