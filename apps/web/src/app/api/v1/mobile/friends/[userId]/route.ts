import { mobileFriendRemoveRoute, type MobileFriendRouteContext } from "../route-logic";

export function DELETE(request: Request, context: MobileFriendRouteContext) {
  return mobileFriendRemoveRoute(request, context);
}
