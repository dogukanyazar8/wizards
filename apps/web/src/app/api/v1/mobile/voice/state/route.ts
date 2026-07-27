import {
  MobileVoiceStateDeleteRequestSchema,
  MobileVoiceStateLeaveResponseSchema,
  MobileVoiceStateMutationResponseSchema,
  MobileVoiceStateUpsertRequestSchema,
} from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiSession } from "@/lib/auth/api";
import { readRequestAttribution } from "@/lib/analytics/client-attribution";
import { logError } from "@/lib/logger";
import { clearVoiceState, emitVoiceStateUpdate, upsertVoiceState } from "@/lib/voice/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function POST(request: Request) {
  try {
    const session = await requireMobileApiSession(request);
    await enforceApiRateLimit(session.userId, "mobile:voice:state");

    const input = await parseJsonBody(request, MobileVoiceStateUpsertRequestSchema);
    const state = await upsertVoiceState(
      session.userId,
      input,
      readRequestAttribution(request.headers),
    );
    const response = MobileVoiceStateMutationResponseSchema.parse(state);

    void emitVoiceStateUpdate({
      action: "join",
      channelId: response.channelId,
      participants: response.participants,
      serverId: response.serverId,
      userId: session.userId,
    }).catch((error) => {
      logError("[mobile voice] Voice state join emit failed in background", error);
    });

    return Response.json(response, { headers: noStoreHeaders });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireMobileApiSession(request);
    await enforceApiRateLimit(session.userId, "mobile:voice:state");

    const input = await parseJsonBody(request, MobileVoiceStateDeleteRequestSchema);
    const existingState = await clearVoiceState(session.userId, {
      ...(input.sessionId ? { expectedSessionId: input.sessionId } : {}),
    });

    if (existingState) {
      void emitVoiceStateUpdate({
        action: "leave",
        channelId: existingState.channelId,
        serverId: existingState.serverId,
        userId: session.userId,
      }).catch((error) => {
        logError("[mobile voice] Voice state leave emit failed in background", error);
      });
    }

    return Response.json(MobileVoiceStateLeaveResponseSchema.parse({ success: true }), {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return jsonError(error);
  }
}
