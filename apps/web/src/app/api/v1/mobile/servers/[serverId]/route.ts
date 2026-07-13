import {
  mobileServerDeleteRoute,
  mobileServerDetailRoute,
  type MobileServerDetailRouteContext,
  mobileServerUpdateRoute,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileServerDetailRouteContext) {
  return mobileServerDetailRoute(request, context);
}

export function PATCH(request: Request, context: MobileServerDetailRouteContext) {
  return mobileServerUpdateRoute(request, context);
}

export function DELETE(request: Request, context: MobileServerDetailRouteContext) {
  return mobileServerDeleteRoute(request, context);
}
