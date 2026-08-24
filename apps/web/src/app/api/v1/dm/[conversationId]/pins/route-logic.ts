import { z } from "zod";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { emitConversationPinsChanged, type GroupRealtimeServer } from "@/lib/dm/group-realtime";
import {
  listConversationPins,
  pinConversationMessage,
  unpinConversationMessage,
} from "@/lib/dm/pins-service";
import { getSocketServer } from "@/lib/socket/runtime";

/**
 * Mesajlar paketi karar #7 — sabitlenen mesajlar.
 *
 * Üç uç, tek servis. Üyelik ve izin `pins-service` içinde, sorgunun kendisinde
 * zorlanır; bu katman yalnız kimliği, hız sınırını, gövdeyi ve yayını taşır.
 */
export type PinsRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  emitPinsChanged: typeof emitConversationPinsChanged;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  getIo(): GroupRealtimeServer | null;
  listPins: typeof listConversationPins;
  pinMessage: typeof pinConversationMessage;
  unpinMessage: typeof unpinConversationMessage;
};

const defaults: PinsRouteDependencies = {
  authenticate: () => requireApiUserId(),
  emitPinsChanged: emitConversationPinsChanged,
  enforceRateLimit: enforceApiRateLimit,
  getIo: () => getSocketServer(),
  listPins: listConversationPins,
  pinMessage: pinConversationMessage,
  unpinMessage: unpinConversationMessage,
};

const PinMessageRequestSchema = z.object({ messageId: z.string().min(1).max(128) }).strict();

export async function conversationPinsListRoute(
  _request: Request,
  conversationId: string,
  dependencies: PinsRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(_request);
    await dependencies.enforceRateLimit(userId, "dm:pins:list");
    const pins = await dependencies.listPins(conversationId, userId);

    return Response.json({ pins });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Yayın yalnız konuşma kimliğini taşır.
 *
 * Sabitlenenler listesi görüntüleyene göre süzülüyor (silinmiş mesaj, geçmiş
 * penceresi, expiry, kaldırma yetkisi); sayı bile görüntüleyene göre değişebilir.
 * Alıcılar kendi yetkili listelerini yeniden okur.
 */
function announce(dependencies: PinsRouteDependencies, conversationId: string): void {
  const io = dependencies.getIo();

  if (io) {
    dependencies.emitPinsChanged(io, { conversationId });
  }
}

export async function conversationPinCreateRoute(
  request: Request,
  conversationId: string,
  dependencies: PinsRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:pins:write");
    const { messageId } = await parseJsonBody(request, PinMessageRequestSchema);
    const pins = await dependencies.pinMessage(conversationId, messageId, userId);

    announce(dependencies, conversationId);

    return Response.json({ pins }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function conversationPinDeleteRoute(
  request: Request,
  conversationId: string,
  messageId: string,
  dependencies: PinsRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:pins:write");
    const pins = await dependencies.unpinMessage(conversationId, messageId, userId);

    announce(dependencies, conversationId);

    return Response.json({ pins });
  } catch (error) {
    return jsonError(error);
  }
}
