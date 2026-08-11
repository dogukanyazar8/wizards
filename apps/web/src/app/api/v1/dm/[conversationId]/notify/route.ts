import { conversationNotifyRoute } from "../participant-route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return conversationNotifyRoute(request, conversationId);
}
