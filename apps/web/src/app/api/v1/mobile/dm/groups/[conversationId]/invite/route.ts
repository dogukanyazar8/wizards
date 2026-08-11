import { mobileGroupInviteReadRoute, mobileGroupInviteToggleRoute } from "../../invite-route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return mobileGroupInviteReadRoute(request, conversationId);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return mobileGroupInviteToggleRoute(request, conversationId);
}
