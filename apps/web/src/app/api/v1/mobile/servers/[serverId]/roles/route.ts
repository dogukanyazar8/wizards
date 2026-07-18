import {
  mobileAssignableRolesListRoute,
  mobileCreateRoleRoute,
  type MobileAssignableRolesRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileAssignableRolesRouteContext) {
  return mobileAssignableRolesListRoute(request, context);
}

export function POST(request: Request, context: MobileAssignableRolesRouteContext) {
  return mobileCreateRoleRoute(request, context);
}
