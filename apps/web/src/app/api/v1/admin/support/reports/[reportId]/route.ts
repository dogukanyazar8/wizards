import {
  adminSupportReportDetailRoute,
  adminSupportReportStatusRoute,
  type AdminSupportDetailRouteContext,
} from "./route-logic";

export function GET(request: Request, context: AdminSupportDetailRouteContext) {
  return adminSupportReportDetailRoute(request, context);
}

export function PATCH(request: Request, context: AdminSupportDetailRouteContext) {
  return adminSupportReportStatusRoute(request, context);
}
