import { groupClearHistoryRoute } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * §15.5.3's `Geçmişi temizle`. DELETE, because from the caller's side the
 * conversation's history stops existing — even though no message row is removed
 * (see `clearGroupHistory` for why).
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return groupClearHistoryRoute(request, conversationId);
}
