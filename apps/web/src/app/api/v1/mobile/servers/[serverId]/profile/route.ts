import { mobileServerProfileRoute, type MobileServerProfileRouteContext } from "./route-logic";

export function GET(request: Request, context: MobileServerProfileRouteContext) {
  return mobileServerProfileRoute(request, context);
}
