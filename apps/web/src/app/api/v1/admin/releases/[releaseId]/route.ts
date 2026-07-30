import {
  adminReleaseDeleteRoute,
  adminReleaseDetailRoute,
  adminReleaseUpdateRoute,
  type AdminReleaseDetailRouteContext,
} from "./route-logic";

export function DELETE(request: Request, context: AdminReleaseDetailRouteContext) {
  return adminReleaseDeleteRoute(request, context);
}

export function GET(request: Request, context: AdminReleaseDetailRouteContext) {
  return adminReleaseDetailRoute(request, context);
}

export function PATCH(request: Request, context: AdminReleaseDetailRouteContext) {
  return adminReleaseUpdateRoute(request, context);
}
