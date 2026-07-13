import {
  mobileServerMemberKickRoute,
  type MobileServerMemberKickRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function DELETE(request: Request, context: MobileServerMemberKickRouteContext) {
  return mobileServerMemberKickRoute(request, context);
}
