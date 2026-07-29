import { mobileReleaseDetailRoute, type MobileReleaseDetailRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileReleaseDetailRouteContext) {
  return mobileReleaseDetailRoute(request, context);
}
