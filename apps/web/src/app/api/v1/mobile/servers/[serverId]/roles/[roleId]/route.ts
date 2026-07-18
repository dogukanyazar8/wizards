import {
  mobileDeleteRoleRoute,
  mobileUpdateRoleRoute,
  type MobileServerRoleRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function PATCH(request: Request, context: MobileServerRoleRouteContext) {
  return mobileUpdateRoleRoute(request, context);
}

export function DELETE(request: Request, context: MobileServerRoleRouteContext) {
  return mobileDeleteRoleRoute(request, context);
}
