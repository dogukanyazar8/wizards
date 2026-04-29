import { requireApiUserId } from "@/lib/auth/api";
import { jsonError, parseJsonBody } from "@/lib/api";
import {
  CreateGiphyAttachmentSchema,
  createGiphyAttachment,
} from "@/lib/giphy/service";

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    const input = await parseJsonBody(request, CreateGiphyAttachmentSchema);

    return Response.json(await createGiphyAttachment(userId, input.gifId), {
      status: 201,
    });
  } catch (error) {
    return jsonError(error);
  }
}
