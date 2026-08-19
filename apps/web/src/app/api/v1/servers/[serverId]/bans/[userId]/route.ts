import { deleteBanRoute, type UnbanMemberRouteContext } from "./route-logic";

export function DELETE(request: Request, context: UnbanMemberRouteContext) {
  return deleteBanRoute(request, context);
}
