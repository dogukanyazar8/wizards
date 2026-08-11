import { mobileGroupCallStateRoute, mobileGroupDefaults } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return mobileGroupCallStateRoute(request, conversationId, mobileGroupDefaults);
}
