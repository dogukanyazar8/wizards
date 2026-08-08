import { mobileDMSetMutedRoute, type MobileDMConversationRouteContext } from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: Request, context: MobileDMConversationRouteContext) {
  return mobileDMSetMutedRoute(request, context);
}
