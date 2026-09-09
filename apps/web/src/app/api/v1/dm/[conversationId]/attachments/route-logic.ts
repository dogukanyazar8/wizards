import { SharedMediaKindSchema, SharedMediaPageSchema, type SharedMediaPage } from "@wizards/types";
import { z } from "zod";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import {
  getConversationSharedItems,
  type ConversationSharedItemsInput,
} from "@/lib/dm/shared-media";
import { DMConversationParamsSchema } from "@/lib/dm/types";

/**
 * `GET /api/v1/dm/[conversationId]/attachments?kind=&cursor=&limit=`
 *
 * §15.5's Medya tab. 1:1 DMs and groups read the same endpoint — the only thing
 * that separates them is which participant row `requireDMParticipant` finds,
 * and that check lives in the service so no caller can skip it.
 */

export const DM_SHARED_ITEMS_PAGE_DEFAULT = 30;

/**
 * `limit` counts **messages**, not items, because the cursor is a message id.
 * One message carries up to `MESSAGE_ATTACHMENT_MAX_COUNT` attachments, so a
 * page yields between 0 and `5 * limit` media/file items and up to `10 * limit`
 * links.
 */
export const DM_SHARED_ITEMS_PAGE_MAX = 50;

export const DmSharedItemsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(128).optional(),
    kind: SharedMediaKindSchema.optional().default("media"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(DM_SHARED_ITEMS_PAGE_MAX)
      .optional()
      .default(DM_SHARED_ITEMS_PAGE_DEFAULT),
  })
  .strict();

export type DmSharedItemsRouteContext = { params: Promise<{ conversationId: string }> };

export type DmSharedItemsRouteDependencies = {
  authenticate(): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  listSharedItems(input: ConversationSharedItemsInput): Promise<SharedMediaPage>;
};

const defaultDependencies: DmSharedItemsRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listSharedItems: getConversationSharedItems,
};

export async function dmSharedItemsRoute(
  request: Request,
  context: DmSharedItemsRouteContext,
  dependencies: DmSharedItemsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "dm:attachments");
    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    const query = DmSharedItemsQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );

    return Response.json(
      SharedMediaPageSchema.parse(
        await dependencies.listSharedItems({ ...query, conversationId, viewerId: userId }),
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
