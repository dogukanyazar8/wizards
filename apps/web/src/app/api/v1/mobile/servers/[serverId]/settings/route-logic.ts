import {
  MobileServerIdParamsSchema,
  MobileServerUserSettingsResponseSchema,
  UpdateServerUserSettingsSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { updateServerUserSettings } from "@/lib/workspace/server-user-settings-service";

export type MobileServerUserSettingsRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerUserSettingsRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:server:user-settings:update"): Promise<void>;
  parseBody: typeof parseJsonBody;
  updateSettings: typeof updateServerUserSettings;
};

const defaultDependencies: MobileServerUserSettingsRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  updateSettings: updateServerUserSettings,
};

/**
 * Faz 1 §C2: one endpoint for every per-user server preference. 6c's "Yıldızla"
 * and "Sessize al" switches and the notification level all write here, so Faz 4
 * has no reason to open a route per switch.
 */
export async function mobileServerUserSettingsUpdateRoute(
  request: Request,
  context: MobileServerUserSettingsRouteContext,
  dependencies: MobileServerUserSettingsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:user-settings:update");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, UpdateServerUserSettingsSchema);
    const settings = await dependencies.updateSettings(userId, serverId, input);

    return Response.json(MobileServerUserSettingsResponseSchema.parse({ settings }));
  } catch (error) {
    return jsonError(error);
  }
}
