import { mobileDMMessageThreadRoute, type MobileDMMessageRouteContext } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: MobileDMMessageRouteContext) {
  return mobileDMMessageThreadRoute(request, context);
}
