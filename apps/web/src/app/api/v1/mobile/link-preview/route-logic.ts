import { MobileLinkPreviewRequestSchema, MobileLinkPreviewResponseSchema } from "@wizards/types";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { fetchLinkPreview } from "@/lib/messages/link-preview";

export type MobileLinkPreviewRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
  fetchPreview: typeof fetchLinkPreview;
};

const defaultDependencies: MobileLinkPreviewRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  fetchPreview: fetchLinkPreview,
};

export async function mobileLinkPreviewRoute(
  request: Request,
  dependencies: MobileLinkPreviewRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:link-preview");
    const input = await dependencies.parseBody(request, MobileLinkPreviewRequestSchema);
    const result = await dependencies.fetchPreview(input.url);
    return Response.json(MobileLinkPreviewResponseSchema.parse(result));
  } catch (error) {
    return jsonError(error);
  }
}
