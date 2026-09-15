"use server";

import { prisma } from "@wizards/db";
import {
  activeProfileStatus,
  ProfileDetailsUpdateSchema,
  type ProfileDetailsUpdate,
} from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { updateAccountProfile } from "@/lib/account/service";
import { logError } from "@/lib/logger";

export async function getProfileDetailsAction() {
  const userId = await requireApiUserId();
  await enforceApiRateLimit(userId, "settings:bootstrap");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      bio: true,
      customStatus: true,
      customStatusEmoji: true,
      customStatusExpiresAt: true,
    },
  });
  return { bio: user.bio, ...activeProfileStatus(user) };
}

export async function updateProfileDetailsAction(input: ProfileDetailsUpdate) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "settings:update");
    const parsed = ProfileDetailsUpdateSchema.parse(input);
    const user = await updateAccountProfile(userId, parsed);
    return { success: true as const, profile: { bio: user.bio, ...activeProfileStatus(user) } };
  } catch (error) {
    logError("[profile-details] update failed", error);
    return { success: false as const, error: "settings.account.errors.save" };
  }
}
