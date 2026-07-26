import {
  mobileServerInviteLinkUpdateRoute,
  mobileServerInviteSheetRoute,
  type MobileServerInvitesRouteContext,
} from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileServerInvitesRouteContext) {
  return mobileServerInviteSheetRoute(request, context);
}

/** "Düzenle": replaces the shared link with one carrying the new limits. */
export function PUT(request: Request, context: MobileServerInvitesRouteContext) {
  return mobileServerInviteLinkUpdateRoute(request, context);
}
