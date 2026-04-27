import { requireApiUserId } from "@/lib/auth/api";
import { jsonError, parseJsonBody } from "@/lib/api";
import { createOrOpenDirectMessage, listDirectMessages } from "@/lib/dm/service";
import { CreateDMBodySchema } from "@/lib/dm/types";

export async function GET() {
  try {
    const userId = await requireApiUserId();
    const conversations = await listDirectMessages(userId);

    return Response.json(conversations);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    const input = await parseJsonBody(request, CreateDMBodySchema);
    const conversation = await createOrOpenDirectMessage(userId, input.userId);

    return Response.json(conversation);
  } catch (error) {
    return jsonError(error);
  }
}
