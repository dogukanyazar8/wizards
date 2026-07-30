import {
  MobileInvitePreviewResponseSchema,
  MobileServerInviteCodeParamsSchema,
} from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { getMobileInvitePreview } from "@/lib/invites/mobile-invite-preview-service";

export type MobileInvitePreviewRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileInvitePreviewRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:invite:preview"): Promise<void>;
  getInvitePreview: typeof getMobileInvitePreview;
};

const defaultDependencies: MobileInvitePreviewRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  getInvitePreview: getMobileInvitePreview,
};

export async function mobileInvitePreviewRoute(
  request: Request,
  context: MobileInvitePreviewRouteContext,
  dependencies: MobileInvitePreviewRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:invite:preview");
    const { code } = MobileServerInviteCodeParamsSchema.parse(await context.params);
    const preview = await dependencies.getInvitePreview(userId, code);

    return Response.json(MobileInvitePreviewResponseSchema.parse(preview));
  } catch (error) {
    return jsonError(error);
  }
}
