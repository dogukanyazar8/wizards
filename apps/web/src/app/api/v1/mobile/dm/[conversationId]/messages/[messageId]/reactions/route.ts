import { mobileDMMessageReactionRoute, type MobileDMMessageRouteContext } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(request: Request, context: MobileDMMessageRouteContext) {
  return mobileDMMessageReactionRoute(request, context, true);
}

export async function DELETE(request: Request, context: MobileDMMessageRouteContext) {
  return mobileDMMessageReactionRoute(request, context, false);
}
