import {
  conversationNotifyRoute,
  conversationPinRoute,
  type DMParticipantRouteDependencies,
} from "@/app/api/v1/dm/[conversationId]/participant-route-logic";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { emitConversationNotifyChanged, emitConversationPinChanged } from "@/lib/dm/group-realtime";
import { setConversationPin, setNotifyLevel } from "@/lib/dm/group-service";
import { getSocketServer } from "@/lib/socket/runtime";

export const mobileParticipantDefaults: DMParticipantRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  emitNotifyChanged: emitConversationNotifyChanged,
  emitPinChanged: emitConversationPinChanged,
  enforceRateLimit: enforceApiRateLimit,
  getIo: () => getSocketServer(),
  setNotifyLevel,
  setPin: setConversationPin,
};

/**
 * Only the rate-limit bucket is rewritten. `authenticate` is left alone, exactly
 * as the group mirror does: overriding it would re-resolve an identity a shell
 * already established.
 */
function toMobileDependencies(
  dependencies: DMParticipantRouteDependencies,
): DMParticipantRouteDependencies {
  return {
    ...dependencies,
    enforceRateLimit: (userId) => dependencies.enforceRateLimit(userId, "mobile:dm:mute"),
  };
}

export async function mobileConversationNotifyRoute(
  request: Request,
  conversationId: string,
  dependencies: DMParticipantRouteDependencies = mobileParticipantDefaults,
): Promise<Response> {
  return await conversationNotifyRoute(request, conversationId, toMobileDependencies(dependencies));
}

export async function mobileConversationPinRoute(
  request: Request,
  conversationId: string,
  dependencies: DMParticipantRouteDependencies = mobileParticipantDefaults,
): Promise<Response> {
  return await conversationPinRoute(request, conversationId, toMobileDependencies(dependencies));
}
