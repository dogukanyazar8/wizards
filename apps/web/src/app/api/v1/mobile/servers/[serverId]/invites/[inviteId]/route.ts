import {
  mobileServerInviteRevokeRoute,
  type MobileServerInvitesRouteContext,
} from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function DELETE(request: Request, context: MobileServerInvitesRouteContext) {
  return mobileServerInviteRevokeRoute(request, context);
}
