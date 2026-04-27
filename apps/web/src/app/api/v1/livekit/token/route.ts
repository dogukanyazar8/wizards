import { requireApiUserId } from "@/lib/auth/api";
import { jsonError, parseJsonBody } from "@/lib/api";
import { createLiveKitToken } from "@/lib/livekit/server";
import { CreateLiveKitTokenBodySchema } from "@/lib/livekit/types";

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    const input = await parseJsonBody(request, CreateLiveKitTokenBodySchema);
    const response = await createLiveKitToken(userId, input);

    return Response.json(response);
  } catch (error) {
    return jsonError(error);
  }
}
