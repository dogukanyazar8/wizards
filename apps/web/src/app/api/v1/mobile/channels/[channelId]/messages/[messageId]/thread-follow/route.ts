import { mobileThreadFollowRoute, type MobileThreadFollowRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileThreadFollowRouteContext) {
  return mobileThreadFollowRoute(request, context, "GET");
}

export function PUT(request: Request, context: MobileThreadFollowRouteContext) {
  return mobileThreadFollowRoute(request, context, "PUT");
}

export function DELETE(request: Request, context: MobileThreadFollowRouteContext) {
  return mobileThreadFollowRoute(request, context, "DELETE");
}
