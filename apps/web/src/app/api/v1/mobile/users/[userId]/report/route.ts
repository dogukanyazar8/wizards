import { mobileUserReportRoute, type MobileUserRouteContext } from "../route-logic";

export function POST(request: Request, context: MobileUserRouteContext) {
  return mobileUserReportRoute(request, context);
}
