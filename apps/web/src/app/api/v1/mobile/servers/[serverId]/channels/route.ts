import {
  mobileServerChannelCreateRoute,
  type MobileServerChannelsRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request, context: MobileServerChannelsRouteContext) {
  return mobileServerChannelCreateRoute(request, context);
}
