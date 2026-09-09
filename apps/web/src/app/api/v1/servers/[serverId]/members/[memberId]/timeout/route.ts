import { patchMemberTimeoutRoute, type TimeoutMemberRouteContext } from "./route-logic";

export function PATCH(request: Request, context: TimeoutMemberRouteContext) {
  return patchMemberTimeoutRoute(request, context);
}
