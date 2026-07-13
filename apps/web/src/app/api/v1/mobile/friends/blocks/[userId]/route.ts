import {
  mobileFriendBlockRoute,
  mobileFriendUnblockRoute,
  type MobileFriendRouteContext,
} from "../../route-logic";

export function DELETE(request: Request, context: MobileFriendRouteContext) {
  return mobileFriendUnblockRoute(request, context);
}

export function PUT(request: Request, context: MobileFriendRouteContext) {
  return mobileFriendBlockRoute(request, context);
}
