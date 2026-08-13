"use server";

import { z } from "zod";
import { UserStatus, prisma } from "@wizards/db";
import { auth, normalizeAuthEmail, unstable_update } from "@/auth";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  startTwoFactorSetup,
  type ConfirmTwoFactorSetupResult,
  type StartTwoFactorSetupResult,
  type TwoFactorFailureResult,
} from "@/lib/auth/two-factor";
import {
  broadcastUserProfileUpdate,
  mapVisiblePresenceStatus,
  updateAccountPresence,
  updateAccountProfile,
} from "@/lib/account/service";
import { ApiError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { logError } from "@/lib/logger";
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
    process.env.E2E_TEST_MODE === "true" &&
    process.env.NODE_ENV !== "production" &&
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
    return result.success ? result : mapTwoFactorActionFailure(result);
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
    const result = await disableTwoFactor({
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
    logError("[account] Two-factor disable failed", error);
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
