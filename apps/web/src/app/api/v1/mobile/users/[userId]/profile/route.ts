import { mobileUserProfileRoute, type MobileUserRouteContext } from "../route-logic";

export function GET(request: Request, context: MobileUserRouteContext) {
  return mobileUserProfileRoute(request, context);
}
