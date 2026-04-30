"use server";

import { z } from "zod";
import { UserStatus, prisma } from "@wizards/db";
import { auth, normalizeAuthEmail, unstable_update } from "@/auth";
import {
  broadcastPresenceUpdateToFriends,
  persistUserPresence,
} from "@/lib/friends/service";
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

export type AccountSettingsState = {
  avatarUrl: string | null;
  displayName: string | null;
  email: string;
  status: UserStatus;
  username: string;
};

type AccountSettingsField = "displayName" | "email" | "status" | "username";

export type UpdateAccountSettingsResult = {
  error?: string;
  fieldErrors?: Partial<Record<AccountSettingsField, string>>;
  success: boolean;
  user?: AccountSettingsState;
};

const UpdatePresenceStatusSchema = z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]);

export type UpdatePresenceStatusResult = {
  error?: string;
  status?: FriendPresenceStatus;
  success: boolean;
};

function mapUserToAccountState(user: {
  avatarUrl: string | null;
  displayName: string | null;
  email: string;
  status: UserStatus;
  username: string;
}): AccountSettingsState {
  return {
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    email: user.email,
    status: user.status,
    username: user.username,
  };
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
      displayName: true,
      email: true,
      status: true,
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

  return {
    success: true,
    user: mapUserToAccountState(updatedUser),
  };
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
