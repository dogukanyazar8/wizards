import {
  mobileServerInviteCreateRoute,
  mobileServerInvitesListRoute,
  type MobileServerInvitesRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileServerInvitesRouteContext) {
  return mobileServerInvitesListRoute(request, context);
}

export function POST(request: Request, context: MobileServerInvitesRouteContext) {
  return mobileServerInviteCreateRoute(request, context);
}
