import {
  mobileFriendRequestAcceptRoute,
  type MobileFriendRouteContext,
} from "../../../route-logic";

export function POST(request: Request, context: MobileFriendRouteContext) {
  return mobileFriendRequestAcceptRoute(request, context);
}
