import { mobileDMDetailsRoute, type MobileDMDetailsRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileDMDetailsRouteContext) {
  return mobileDMDetailsRoute(request, context);
}
