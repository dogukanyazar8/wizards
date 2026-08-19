import { postBanMemberRoute, type BanMemberRouteContext } from "./route-logic";

export function POST(request: Request, context: BanMemberRouteContext) {
  return postBanMemberRoute(request, context);
}
