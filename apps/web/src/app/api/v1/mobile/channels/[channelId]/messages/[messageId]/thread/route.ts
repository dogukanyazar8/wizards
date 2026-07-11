import {
  mobileChannelMessageThreadRoute,
  type MobileChannelMessageRouteContext,
} from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: MobileChannelMessageRouteContext) {
  return mobileChannelMessageThreadRoute(request, context);
}
