import { groupRemoveMemberRoute } from "../../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ conversationId: string; userId: string }> },
) {
  const { conversationId, userId } = await context.params;
  return groupRemoveMemberRoute(request, conversationId, userId);
}
