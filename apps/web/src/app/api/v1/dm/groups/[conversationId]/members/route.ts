import { groupAddMembersRoute, groupMembersReadRoute } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** §15.4's roster. Membership is the gate; the role chips ride on the rows. */
export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return groupMembersReadRoute(request, conversationId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return groupAddMembersRoute(request, conversationId);
}
