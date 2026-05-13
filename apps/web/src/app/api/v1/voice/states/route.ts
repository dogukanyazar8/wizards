import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { listVoiceStatesForServer } from "@/lib/voice/service";
import { VoiceStatesQuerySchema } from "@/lib/voice/types";

export async function GET(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "voice:states:list");
    const url = new URL(request.url);
    const query = VoiceStatesQuerySchema.parse({
      serverId: url.searchParams.get("serverId"),
    });
    const states = await listVoiceStatesForServer(userId, query.serverId);

    return Response.json({ states });
  } catch (error) {
    return jsonError(error);
  }
}
