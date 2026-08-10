import {
  mobileServerEventCancelRoute,
  mobileServerEventUpdateRoute,
  type MobileServerEventRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function PATCH(request: Request, context: MobileServerEventRouteContext) {
  return mobileServerEventUpdateRoute(request, context);
}

export function DELETE(request: Request, context: MobileServerEventRouteContext) {
  return mobileServerEventCancelRoute(request, context);
}
