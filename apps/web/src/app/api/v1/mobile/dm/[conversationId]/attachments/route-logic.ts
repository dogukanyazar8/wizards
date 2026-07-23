import {
  MobileDMAttachmentsQuerySchema,
  MobileDMAttachmentsResponseSchema,
  MobileDMDetailsParamsSchema,
} from "@wizards/types";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { listMobileDMAttachments } from "@/lib/dm/mobile-shared-media-service";

export type MobileDMAttachmentsRouteContext = { params: Promise<Record<string, string>> };
export type MobileDMAttachmentsRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  listAttachments: typeof listMobileDMAttachments;
};
const defaultDependencies: MobileDMAttachmentsRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  listAttachments: listMobileDMAttachments,
};

export async function mobileDMAttachmentsRoute(
  request: Request,
  context: MobileDMAttachmentsRouteContext,
  dependencies: MobileDMAttachmentsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:dm:attachments");
    const { conversationId } = MobileDMDetailsParamsSchema.parse(await context.params);
    const query = MobileDMAttachmentsQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    return Response.json(
      MobileDMAttachmentsResponseSchema.parse(
        await dependencies.listAttachments({ ...query, conversationId, userId }),
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
