import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { CreateGiphyAttachmentSchema, createGiphyAttachment } from "@/lib/giphy/service";

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "giphy:attachment");
    const input = await parseJsonBody(request, CreateGiphyAttachmentSchema);

    return Response.json(await createGiphyAttachment(userId, input.gifId), {
      status: 201,
    });
  } catch (error) {
    return jsonError(error);
  }
}
