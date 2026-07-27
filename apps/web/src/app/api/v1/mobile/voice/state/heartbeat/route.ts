import {
  MobileVoiceHeartbeatRequestSchema,
  MobileVoiceHeartbeatResponseSchema,
} from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiSession } from "@/lib/auth/api";
import { readRequestAttribution } from "@/lib/analytics/client-attribution";
import { heartbeatVoiceState } from "@/lib/voice/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: Request) {
  try {
    const session = await requireMobileApiSession(request);
    await enforceApiRateLimit(session.userId, "mobile:voice:heartbeat");

    const input = await parseJsonBody(request, MobileVoiceHeartbeatRequestSchema);
    const state = await heartbeatVoiceState(
      session.userId,
      input,
      readRequestAttribution(request.headers),
    );
    const response = MobileVoiceHeartbeatResponseSchema.parse({
      channelId: state.channelId,
      serverId: state.serverId,
      success: true,
    });

    return Response.json(response, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
