import { mobileServerLeaveRoute, type MobileServerLeaveRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function DELETE(request: Request, context: MobileServerLeaveRouteContext) {
  return mobileServerLeaveRoute(request, context);
}
