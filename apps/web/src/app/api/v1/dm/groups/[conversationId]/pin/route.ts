import { groupPinRoute, groupUnpinRoute } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return groupPinRoute(request, conversationId);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return groupUnpinRoute(request, conversationId);
}
