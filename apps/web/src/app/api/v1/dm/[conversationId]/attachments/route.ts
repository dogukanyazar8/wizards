import { dmSharedItemsRoute, type DmSharedItemsRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: DmSharedItemsRouteContext) {
  return dmSharedItemsRoute(request, context);
}
