import { mobileFriendRequestCancelRoute, type MobileFriendRouteContext } from "../../route-logic";

export function DELETE(request: Request, context: MobileFriendRouteContext) {
  return mobileFriendRequestCancelRoute(request, context);
}
