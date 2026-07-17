import {
  MobileAccountSettingsResponseSchema,
  MobileAccountSettingsUpdateSchema,
  type MobileAccountSettingsResponse,
  type MobileAccountSettingsUpdate,
} from "@wizards/types";
import { prisma } from "@wizards/db";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" } as const;

function withNoStore(response: Response) {
  response.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
  return response;
}

export type MobileAccountSettingsRecord = {
  account: {
    bio: string | null;
    customStatus: string | null;
    email: string;
    emailVerified: boolean;
  };
  privacy: {
    dmPermission: MobileAccountSettingsResponse["privacy"]["dmPermission"];
    friendRequests: MobileAccountSettingsResponse["privacy"]["friendRequests"];
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
  ): Promise<MobileAccountSettingsRecord["privacy"]>;
};

async function loadMobileAccountSettings(userId: string): Promise<MobileAccountSettingsRecord> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      bio: true,
      customStatus: true,
      email: true,
      emailVerified: true,
      settings: {
        select: {
          dmPolicy: true,
          friendRequestPolicy: true,
        },
      },
    },
  });

  if (!user?.settings) {
    throw new ApiError("Account settings not found", 404, "NOT_FOUND");
  }

  return {
    account: {
      bio: user.bio,
      customStatus: user.customStatus,
      email: user.email,
      emailVerified: user.emailVerified,
    },
    privacy: {
      dmPermission: user.settings.dmPolicy,
      friendRequests: user.settings.friendRequestPolicy,
    },
  };
}

async function updateMobileAccountSettings(
  userId: string,
  input: MobileAccountSettingsUpdate,
): Promise<MobileAccountSettingsRecord["privacy"]> {
  const settings = await prisma.userSettings.update({
    where: { userId },
    data: {
      ...(input.dmPermission !== undefined ? { dmPolicy: input.dmPermission } : {}),
      ...(input.friendRequests !== undefined ? { friendRequestPolicy: input.friendRequests } : {}),
    },
    select: {
      dmPolicy: true,
      friendRequestPolicy: true,
    },
  });

  return {
    dmPermission: settings.dmPolicy,
    friendRequests: settings.friendRequestPolicy,
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
    const privacy = await dependencies.updateSettings(userId, input);
    const settings = await dependencies.loadSettings(userId);

    return Response.json(MobileAccountSettingsResponseSchema.parse({ ...settings, privacy }), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return withNoStore(jsonError(error));
  }
}
