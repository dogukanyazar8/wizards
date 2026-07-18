import {
  mobileServerRoleOverviewListRoute,
  type MobileServerRoleOverviewRouteContext,
} from "./route-logic";

export function GET(request: Request, context: MobileServerRoleOverviewRouteContext) {
  return mobileServerRoleOverviewListRoute(request, context);
}
