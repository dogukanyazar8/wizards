import {
  mobileServerJoinPublicRoute,
  type MobileServerJoinPublicRouteContext,
} from "./route-logic";

export function POST(request: Request, context: MobileServerJoinPublicRouteContext) {
  return mobileServerJoinPublicRoute(request, context);
}
