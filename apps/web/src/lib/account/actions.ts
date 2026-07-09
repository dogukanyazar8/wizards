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
  broadcastPresenceUpdateToFriends,
  persistUserPresence,
} from "@/lib/friends/service";
import { logError } from "@/lib/logger";
import type { FriendPresenceStatus } from "@/lib/friends/types";
import type { UserProfileUpdatedPayload } from "@/lib/socket/events";
import { getSocketServer } from "@/lib/socket/runtime";

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

function mapVisiblePresenceStatus(status: UserStatus): FriendPresenceStatus {
  if (
    status === UserStatus.ONLINE ||
    status === UserStatus.IDLE ||
    status === UserStatus.DND ||
    status === UserStatus.OFFLINE
  ) {
    return status;
  }

  return "OFFLINE";
}

function mapTwoFactorError(error: TwoFactorFailureResult["error"]) {
  switch (error) {
    case "already_enabled":
      return "settings.account.twoFactor.errors.alreadyEnabled";
    case "invalid_code":
      return "settings.account.twoFactor.errors.invalidCode";
    case "invalid_credentials":
      return "settings.account.twoFactor.errors.invalidCredentials";
    case "not_enabled":
      return "settings.account.twoFactor.errors.notEnabled";
    case "not_found":
      return "settings.account.twoFactor.errors.unavailable";
    case "rate_limited":
      return "settings.account.twoFactor.errors.rateLimited";
    case "setup_required":
      return "settings.account.twoFactor.errors.setupRequired";
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

async function broadcastUserProfileUpdate(profile: UserProfileUpdatedPayload) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  const [friendships, serverMemberships] = await Promise.all([
    prisma.friendRequest.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ senderId: profile.userId }, { receiverId: profile.userId }],
      },
      select: {
        receiverId: true,
        senderId: true,
      },
    }),
    prisma.serverMember.findMany({
      where: { userId: profile.userId },
      select: { serverId: true },
    }),
  ]);

  const targetUserIds = new Set<string>([profile.userId]);

  for (const friendship of friendships) {
    targetUserIds.add(
      friendship.senderId === profile.userId
        ? friendship.receiverId
        : friendship.senderId,
    );
  }

  for (const targetUserId of targetUserIds) {
    io.to(`user:${targetUserId}`).emit("user:profile:updated", profile);
  }

  for (const membership of serverMemberships) {
    io.to(`server:${membership.serverId}`).emit("user:profile:updated", profile);
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

  const nextDisplayName = parsed.data.displayName.trim() || null;
  const nextEmail = parsed.data.email;
  const nextStatus = parsed.data.status;
  const nextUsername = parsed.data.username;

  const [emailConflict, usernameConflict] = await Promise.all([
    prisma.user.findFirst({
      where: {
        email: nextEmail,
        NOT: { id: session.user.id },
      },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: {
        username: nextUsername,
        NOT: { id: session.user.id },
      },
      select: { id: true },
    }),
  ]);

  if (emailConflict) {
    return {
      fieldErrors: { email: "settings.account.errors.emailTaken" },
      success: false,
    };
  }

  if (usernameConflict) {
    return {
      fieldErrors: { username: "settings.account.errors.usernameTaken" },
      success: false,
    };
  }

  const updatedUser = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      displayName: nextDisplayName,
      email: nextEmail,
      status: nextStatus,
      username: nextUsername,
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
      displayName: updatedUser.displayName,
      email: updatedUser.email,
      username: updatedUser.username,
    },
  });

  const visibleStatus = mapVisiblePresenceStatus(updatedUser.status);
  const presence = await persistUserPresence(session.user.id, visibleStatus);

  if (presence) {
    await broadcastPresenceUpdateToFriends(presence);
  }

  await broadcastUserProfileUpdate({
    avatarUrl: updatedUser.avatarUrl,
    customStatus: updatedUser.customStatus,
    displayName: updatedUser.displayName,
    status: visibleStatus,
    userId: session.user.id,
    username: updatedUser.username,
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
    const result = await disableTwoFactor({
      code: input.code,
      password: input.password,
      userId: session.user.id,
    });
    return result.success ? result : mapTwoFactorActionFailure(result);
  } catch (error) {
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

  const presence = await persistUserPresence(session.user.id, parsed.data);

  if (!presence) {
    return {
      error: "settings.account.errors.save",
      success: false,
    };
  }

  await broadcastPresenceUpdateToFriends(presence);

  return {
    status: presence.status,
    success: true,
  };
}
