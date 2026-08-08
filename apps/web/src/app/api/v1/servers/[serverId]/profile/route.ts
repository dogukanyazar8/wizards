import { serverProfileRoute, type ServerProfileRouteContext } from "./route-logic";

export function GET(request: Request, context: ServerProfileRouteContext) {
  return serverProfileRoute(request, context);
}
