import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { getDirectMessageConversationForUser, hideDirectMessage } from "@/lib/dm/service";
import { DMConversationParamsSchema } from "@/lib/dm/types";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export type DirectMessageConversationRouteDependencies = {
  enforceApiRateLimit: typeof enforceApiRateLimit;
  getDirectMessageConversationForUser: (
    conversationId: string,
    userId: string,
  ) => Promise<unknown>;
  hideDirectMessage: typeof hideDirectMessage;
  jsonError: typeof jsonError;
  requireApiUserId: typeof requireApiUserId;
};

const defaultDirectMessageConversationRouteDependencies: DirectMessageConversationRouteDependencies = {
  enforceApiRateLimit,
  getDirectMessageConversationForUser,
  hideDirectMessage,
  jsonError,
  requireApiUserId,
};

export async function getDirectMessageConversationRoute(
  _: Request,
  context: RouteContext,
  dependencies: DirectMessageConversationRouteDependencies =
    defaultDirectMessageConversationRouteDependencies,
) {
  try {
    const userId = await dependencies.requireApiUserId();
    await dependencies.enforceApiRateLimit(userId, "dm:conversation:read");
    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    const conversation = await dependencies.getDirectMessageConversationForUser(
      conversationId,
      userId,
    );

    return Response.json(conversation);
  } catch (error) {
    return dependencies.jsonError(error);
  }
}

export async function deleteDirectMessageConversationRoute(
  _: Request,
  context: RouteContext,
  dependencies: DirectMessageConversationRouteDependencies =
    defaultDirectMessageConversationRouteDependencies,
) {
  try {
    const userId = await dependencies.requireApiUserId();
    await dependencies.enforceApiRateLimit(userId, "dm:hide");
    const { conversationId } = DMConversationParamsSchema.parse(await context.params);
    await dependencies.hideDirectMessage(userId, conversationId);

    return Response.json({ success: true });
  } catch (error) {
    return dependencies.jsonError(error);
  }
}
