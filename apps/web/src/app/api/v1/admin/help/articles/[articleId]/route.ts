import {
  adminHelpArticleDeleteRoute,
  adminHelpArticleDetailRoute,
  adminHelpArticleUpdateRoute,
  type AdminHelpDetailRouteContext,
} from "./route-logic";

export function DELETE(request: Request, context: AdminHelpDetailRouteContext) {
  return adminHelpArticleDeleteRoute(request, context);
}

export function GET(request: Request, context: AdminHelpDetailRouteContext) {
  return adminHelpArticleDetailRoute(request, context);
}

export function PATCH(request: Request, context: AdminHelpDetailRouteContext) {
  return adminHelpArticleUpdateRoute(request, context);
}
