import { mobileDMHideRoute, type MobileDMConversationRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(request: Request, context: MobileDMConversationRouteContext) {
  return mobileDMHideRoute(request, context);
}
