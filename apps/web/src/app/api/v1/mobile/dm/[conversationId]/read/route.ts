import { mobileDMMarkReadRoute, type MobileDMMarkReadRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: Request, context: MobileDMMarkReadRouteContext) {
  return mobileDMMarkReadRoute(request, context);
}
