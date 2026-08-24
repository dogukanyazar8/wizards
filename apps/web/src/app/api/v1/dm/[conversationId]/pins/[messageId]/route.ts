import { conversationPinDeleteRoute } from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ conversationId: string; messageId: string }> },
) {
  const { conversationId, messageId } = await context.params;
  return conversationPinDeleteRoute(request, conversationId, messageId);
}
