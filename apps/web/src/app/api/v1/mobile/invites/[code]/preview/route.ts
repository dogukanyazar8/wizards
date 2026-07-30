import { mobileInvitePreviewRoute, type MobileInvitePreviewRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileInvitePreviewRouteContext) {
  return mobileInvitePreviewRoute(request, context);
}
