import { groupAddMembersRoute } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return groupAddMembersRoute(request, conversationId);
}
