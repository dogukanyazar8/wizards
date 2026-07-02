import {
  MobileVoiceStatesQuerySchema,
  MobileVoiceStatesResponseSchema,
} from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireMobileApiSession } from "@/lib/auth/api";
import { listVoiceStatesForServer } from "@/lib/voice/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const session = await requireMobileApiSession(request);
    await enforceApiRateLimit(session.userId, "mobile:voice:states:list");

    const url = new URL(request.url);
    const query = MobileVoiceStatesQuerySchema.parse({
      serverId: url.searchParams.get("serverId"),
    });
    const states = await listVoiceStatesForServer(session.userId, query.serverId);
    const response = MobileVoiceStatesResponseSchema.parse({ states });

    return Response.json(response, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
