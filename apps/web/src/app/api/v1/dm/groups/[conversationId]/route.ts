import { groupReadRoute, groupUpdateRoute } from "../route-logic";

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
