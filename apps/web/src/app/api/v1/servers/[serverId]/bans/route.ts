import { getServerBansRoute, type ServerBansRouteContext } from "./route-logic";

export function GET(request: Request, context: ServerBansRouteContext) {
  return getServerBansRoute(request, context);
}
