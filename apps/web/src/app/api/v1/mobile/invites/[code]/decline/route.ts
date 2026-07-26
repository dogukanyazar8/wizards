import { mobileInviteDeclineRoute, type MobileInviteDeclineRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request, context: MobileInviteDeclineRouteContext) {
  return mobileInviteDeclineRoute(request, context);
}
