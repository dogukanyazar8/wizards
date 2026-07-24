import { MobileProfileResponseSchema, MobileProfileUpdateSchema } from "@wizards/types";

import {
  getNextUsernameChangeAt,
  resolveVisibleCustomStatus,
  updateAccountProfile,
} from "@/lib/account/service";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";

export type MobileProfileRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
  updateProfile: typeof updateAccountProfile;
};

const defaultDependencies: MobileProfileRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  updateProfile: updateAccountProfile,
};

export async function mobileProfileUpdateRoute(
  request: Request,
  dependencies: MobileProfileRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:account:profile");
    const input = await dependencies.parseBody(request, MobileProfileUpdateSchema);
    const user = await dependencies.updateProfile(userId, input);
    return Response.json(
      MobileProfileResponseSchema.parse({
        user: {
          avatarUrl: user.avatarUrl,
          bannerColor: user.bannerColor,
          bannerOffsetX: user.bannerOffsetX,
          bannerOffsetY: user.bannerOffsetY,
          bannerUrl: user.bannerUrl,
          bio: user.bio,
          ...resolveVisibleCustomStatus(user),
          displayName: user.displayName,
          id: user.id,
          nextUsernameChangeAt:
            getNextUsernameChangeAt(user.usernameChangedAt)?.toISOString() ?? null,
          pronouns: user.pronouns,
          status: user.status,
          twoFactorEnabled: user.twoFactorEnabled,
          username: user.username,
        },
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
