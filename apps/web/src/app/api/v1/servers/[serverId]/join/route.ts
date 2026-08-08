import { serverJoinRoute, type ServerJoinRouteContext } from "./route-logic";

export function POST(request: Request, context: ServerJoinRouteContext) {
  return serverJoinRoute(request, context);
}
