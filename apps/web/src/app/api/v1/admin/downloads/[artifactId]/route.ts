import {
  adminDownloadDeleteRoute,
  adminDownloadUpdateRoute,
  type AdminDownloadDetailRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function DELETE(request: Request, context: AdminDownloadDetailRouteContext) {
  return adminDownloadDeleteRoute(request, context);
}

export function PATCH(request: Request, context: AdminDownloadDetailRouteContext) {
  return adminDownloadUpdateRoute(request, context);
}
