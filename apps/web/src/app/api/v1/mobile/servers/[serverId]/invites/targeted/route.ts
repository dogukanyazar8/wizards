import {
  mobileServerTargetedInviteCreateRoute,
  type MobileServerInvitesRouteContext,
} from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request, context: MobileServerInvitesRouteContext) {
  return mobileServerTargetedInviteCreateRoute(request, context);
}
