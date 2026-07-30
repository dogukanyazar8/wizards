import {
  adminReleaseChangesReplaceRoute,
  type AdminReleaseChangesRouteContext,
} from "./route-logic";

export function PUT(request: Request, context: AdminReleaseChangesRouteContext) {
  return adminReleaseChangesReplaceRoute(request, context);
}
