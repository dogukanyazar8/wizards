import { dmProfileRoute, type DmProfileRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: DmProfileRouteContext) {
  return dmProfileRoute(request, context);
}
