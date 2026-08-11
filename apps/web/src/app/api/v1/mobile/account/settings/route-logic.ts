import {
  MobileAccountAppearanceSchema,
  MobileAccountSettingsResponseSchema,
  MobileAccountSettingsUpdateSchema,
  MobileMessageFontSizeSchema,
  type MobileAccountSettingsResponse,
  type MobileAccountSettingsUpdate,
} from "@wizards/types";
import { prisma } from "@wizards/db";

import { getNextUsernameChangeAt, resolveVisibleCustomStatus } from "@/lib/account/service";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" } as const;

function withNoStore(response: Response) {
  response.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
  return response;
}

export type MobileAccountSettingsRecord = {
  appearance: MobileAccountSettingsResponse["appearance"];
  account: {
    bannerColor: string | null;
    bannerOffsetX: number | null;
    bannerOffsetY: number | null;
    bannerUrl: string | null;
    bio: string | null;
    customStatus: string | null;
    customStatusEmoji: string | null;
    customStatusExpiresAt: string | null;
    email: string;
    emailVerified: boolean;
    nextUsernameChangeAt: string | null;
    pronouns: string | null;
    twoFactorEnabled: boolean;
  };
  privacy: {
    dmPermission: MobileAccountSettingsResponse["privacy"]["dmPermission"];
    friendRequests: MobileAccountSettingsResponse["privacy"]["friendRequests"];
    groupInvites: boolean;
  };
};

export type MobileAccountSettingsRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  loadSettings(userId: string): Promise<MobileAccountSettingsRecord>;
  parseBody(request: Request): Promise<MobileAccountSettingsUpdate>;
  updateSettings(
    userId: string,
    input: MobileAccountSettingsUpdate,
  ): Promise<Pick<MobileAccountSettingsRecord, "appearance" | "privacy">>;
};

async function loadMobileAccountSettings(userId: string): Promise<MobileAccountSettingsRecord> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      bannerColor: true,
      bannerOffsetX: true,
      bannerOffsetY: true,
      bannerUrl: true,
      bio: true,
      customStatus: true,
      customStatusEmoji: true,
      customStatusExpiresAt: true,
      email: true,
      emailVerified: true,
      pronouns: true,
      twoFactorEnabled: true,
      usernameChangedAt: true,
      settings: {
        select: {
          allowGroupInvites: true,
          dmPolicy: true,
          friendRequestPolicy: true,
          messageBodyCompact: true,
          messageBodyFollowSystemFont: true,
          messageBodySize: true,
        },
      },
    },
  });

  if (!user?.settings) {
    throw new ApiError("Account settings not found", 404, "NOT_FOUND");
  }

  return {
    appearance: MobileAccountAppearanceSchema.parse({
      messageCompact: user.settings.messageBodyCompact,
      messageFollowSystemFont: user.settings.messageBodyFollowSystemFont,
      // A column value written by an older client is normalised back to the
      // default rather than failing the whole settings read.
      messageFontSize: MobileMessageFontSizeSchema.safeParse(user.settings.messageBodySize).data,
    }),
    account: {
      bannerColor: user.bannerColor,
      bannerOffsetX: user.bannerOffsetX,
      bannerOffsetY: user.bannerOffsetY,
      bannerUrl: user.bannerUrl,
      bio: user.bio,
      ...resolveVisibleCustomStatus(user),
      email: user.email,
      emailVerified: user.emailVerified,
      nextUsernameChangeAt: getNextUsernameChangeAt(user.usernameChangedAt)?.toISOString() ?? null,
      pronouns: user.pronouns,
      twoFactorEnabled: user.twoFactorEnabled,
    },
    privacy: {
      dmPermission: user.settings.dmPolicy,
      friendRequests: user.settings.friendRequestPolicy,
      // 2b §7's other side: the switch a member flips on themselves, which the
      // picker on somebody else's phone reads through the friends payload.
      groupInvites: user.settings.allowGroupInvites,
    },
  };
}

async function updateMobileAccountSettings(
  userId: string,
  input: MobileAccountSettingsUpdate,
): Promise<Pick<MobileAccountSettingsRecord, "appearance" | "privacy">> {
  const settings = await prisma.userSettings.update({
    where: { userId },
    data: {
      ...(input.dmPermission !== undefined ? { dmPolicy: input.dmPermission } : {}),
      ...(input.friendRequests !== undefined ? { friendRequestPolicy: input.friendRequests } : {}),
      ...(input.groupInvites !== undefined ? { allowGroupInvites: input.groupInvites } : {}),
      ...(input.messageCompact !== undefined ? { messageBodyCompact: input.messageCompact } : {}),
      ...(input.messageFollowSystemFont !== undefined
        ? { messageBodyFollowSystemFont: input.messageFollowSystemFont }
        : {}),
      ...(input.messageFontSize !== undefined ? { messageBodySize: input.messageFontSize } : {}),
    },
    select: {
      allowGroupInvites: true,
      dmPolicy: true,
      friendRequestPolicy: true,
      messageBodyCompact: true,
      messageBodyFollowSystemFont: true,
      messageBodySize: true,
    },
  });

  return {
    appearance: MobileAccountAppearanceSchema.parse({
      messageCompact: settings.messageBodyCompact,
      messageFollowSystemFont: settings.messageBodyFollowSystemFont,
      messageFontSize: MobileMessageFontSizeSchema.safeParse(settings.messageBodySize).data,
    }),
    privacy: {
      dmPermission: settings.dmPolicy,
      friendRequests: settings.friendRequestPolicy,
      groupInvites: settings.allowGroupInvites,
    },
  };
}

const defaultDependencies: MobileAccountSettingsRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  loadSettings: loadMobileAccountSettings,
  parseBody: (request) => parseJsonBody(request, MobileAccountSettingsUpdateSchema),
  updateSettings: updateMobileAccountSettings,
};

export async function mobileAccountSettingsGetRoute(
  request: Request,
  dependencies: MobileAccountSettingsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:account:settings");
    const settings = await dependencies.loadSettings(userId);

    return Response.json(MobileAccountSettingsResponseSchema.parse(settings), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return withNoStore(jsonError(error));
  }
}

export async function mobileAccountSettingsUpdateRoute(
  request: Request,
  dependencies: MobileAccountSettingsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:account:settings");
    const input = await dependencies.parseBody(request);
    const written = await dependencies.updateSettings(userId, input);
    const settings = await dependencies.loadSettings(userId);

    return Response.json(MobileAccountSettingsResponseSchema.parse({ ...settings, ...written }), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return withNoStore(jsonError(error));
  }
}
