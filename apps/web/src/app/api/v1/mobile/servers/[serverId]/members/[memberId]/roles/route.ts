import {
  mobileServerMemberRolesUpdateRoute,
  type MobileServerMemberRolesRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function PATCH(request: Request, context: MobileServerMemberRolesRouteContext) {
  return mobileServerMemberRolesUpdateRoute(request, context);
}
