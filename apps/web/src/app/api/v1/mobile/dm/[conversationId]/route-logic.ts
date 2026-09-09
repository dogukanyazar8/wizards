import type { SetMutedRequest } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { hideDirectMessage, setDirectMessageMuted } from "@/lib/dm/service";
import { DMConversationParamsSchema, SetDMMutedBodySchema } from "@/lib/dm/types";

export type MobileDMConversationRouteContext = {
  params: Promise<{ conversationId: string }>;
};

/**
 * Faz 5 §17.1. Mute and hide are the two per-participant switches the group
 * details screen owns. The behaviour is the web route's, unchanged — only the
 * identity differs: mobile carries a bearer token, and the web handler resolves
 * a cookie session, so a phone could never have called it.
 */
export type MobileDMConversationRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:dm:hide" | "mobile:dm:mute"): Promise<void>;
  hideConversation(userId: string, conversationId: string): Promise<unknown>;
  setMuted(
    userId: string,
    conversationId: string,
    input: boolean | SetMutedRequest,
  ): Promise<unknown>;
};

const defaultDependencies: MobileDMConversationRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  hideConversation: hideDirectMessage,
  setMuted: setDirectMessageMuted,
};

export async function mobileDMSetMutedRoute(
  request: Request,
  context: MobileDMConversationRouteContext,
  dependencies: MobileDMConversationRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:dm:mute");
    const [{ conversationId }, input] = await Promise.all([
      DMConversationParamsSchema.parse(await context.params),
      parseJsonBody(request, SetDMMutedBodySchema),
    ]);

    // Karar K1. The whole body travels, not just the flag: the duration ladder
    // §17 added is part of the shared contract, so the phone silences a chat for
    // 15 minutes through the same schema the web submenu uses.
    await dependencies.setMuted(userId, conversationId, input);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileDMHideRoute(
  request: Request,
  context: MobileDMConversationRouteContext,
  dependencies: MobileDMConversationRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:dm:hide");
    const { conversationId } = DMConversationParamsSchema.parse(await context.params);

    await dependencies.hideConversation(userId, conversationId);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
