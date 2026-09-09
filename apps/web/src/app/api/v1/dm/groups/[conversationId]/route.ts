import { groupDeleteRoute, groupReadRoute, groupUpdateRoute } from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return groupReadRoute(request, conversationId);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return groupUpdateRoute(request, conversationId);
}

/**
 * §15.5.3's `Grubu sil`. OWNER only — an admin gets a 403 here, not a smaller
 * button (`deleteGroupConversation` carries the reasoning).
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return groupDeleteRoute(request, conversationId);
}
