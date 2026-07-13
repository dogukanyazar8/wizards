import {
  mobileFriendRequestRejectRoute,
  type MobileFriendRouteContext,
} from "../../../route-logic";

export function POST(request: Request, context: MobileFriendRouteContext) {
  return mobileFriendRequestRejectRoute(request, context);
}
