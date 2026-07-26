import { mobileServerInviteQrRoute, type MobileServerInvitesRouteContext } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileServerInvitesRouteContext) {
  return mobileServerInviteQrRoute(request, context);
}
