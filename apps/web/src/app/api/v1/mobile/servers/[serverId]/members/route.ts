import { mobileServerMembersListRoute, type MobileServerMembersRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileServerMembersRouteContext) {
  return mobileServerMembersListRoute(request, context);
}
