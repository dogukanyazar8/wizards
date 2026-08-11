import { mobileGroupDefaults, mobileGroupReadRoute, mobileGroupUpdateRoute } from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return mobileGroupReadRoute(request, conversationId, mobileGroupDefaults);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return mobileGroupUpdateRoute(request, conversationId, mobileGroupDefaults);
}
