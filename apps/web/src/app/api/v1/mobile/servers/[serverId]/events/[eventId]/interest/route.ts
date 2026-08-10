import {
  mobileServerEventInterestRoute,
  type MobileServerEventInterestRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request, context: MobileServerEventInterestRouteContext) {
  return mobileServerEventInterestRoute(request, context);
}
