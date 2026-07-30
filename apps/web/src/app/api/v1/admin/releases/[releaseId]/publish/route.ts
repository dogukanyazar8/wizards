import { adminReleasePublishRoute, type AdminReleasePublishRouteContext } from "./route-logic";

export function POST(request: Request, context: AdminReleasePublishRouteContext) {
  return adminReleasePublishRoute(request, context);
}
