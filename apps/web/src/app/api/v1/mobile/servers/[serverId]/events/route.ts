import {
  mobileServerEventCreateRoute,
  mobileServerEventsListRoute,
  type MobileServerEventsRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileServerEventsRouteContext) {
  return mobileServerEventsListRoute(request, context);
}

export function POST(request: Request, context: MobileServerEventsRouteContext) {
  return mobileServerEventCreateRoute(request, context);
}
