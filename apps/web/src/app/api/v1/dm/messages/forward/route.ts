import { z } from "zod";

import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { forwardDirectMessage } from "@/lib/dm/forward-service";
import { getSocketServer } from "@/lib/socket/runtime";

const ForwardRequestSchema = z
  .object({
    messageId: z.string().min(1).max(64),
    targetConversationId: z.string().min(1).max(64),
  })
  .strict();

export const dynamic = "force-dynamic";

/**
 * `POST /v1/dm/messages/forward` — SPEC-MESAJLAR §5.3.
 *
 * Gönderim hız sınırı **normal mesajla aynı kovada** (`dm:messages:send`):
 * iletme de bir mesaj yazıyor ve ayrı bir kova, sınırın etrafından dolaşmanın
 * ikinci bir yolu olurdu.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "dm:messages:send");
    const body = await parseJsonBody(request, ForwardRequestSchema);

    const message = await forwardDirectMessage({
      io: getSocketServer(),
      messageId: body.messageId,
      targetConversationId: body.targetConversationId,
      userId,
    });

    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
