import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { setDirectMessageMuted } from "@/lib/dm/service";
import { DMConversationParamsSchema, SetDMMutedBodySchema } from "@/lib/dm/types";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "dm:mute");
    const [{ conversationId }, input] = await Promise.all([
      DMConversationParamsSchema.parse(await context.params),
      parseJsonBody(request, SetDMMutedBodySchema),
    ]);

    // §17's toast needs the deadline it just created, and the header pill needs
    // it on the next render — so the state travels back in the response as well
    // as over `dm:conversation:mute`, and a client that missed the socket is
    // never left guessing when the mute runs out.
    const state = await setDirectMessageMuted(userId, conversationId, input);

    return Response.json({ ...state, success: true });
  } catch (error) {
    return jsonError(error);
  }
}
