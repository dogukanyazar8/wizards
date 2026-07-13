import {
  mobileServerCategoryDeleteRoute,
  mobileServerCategoryUpdateRoute,
  type MobileServerCategoryRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function PATCH(request: Request, context: MobileServerCategoryRouteContext) {
  return mobileServerCategoryUpdateRoute(request, context);
}

export function DELETE(request: Request, context: MobileServerCategoryRouteContext) {
  return mobileServerCategoryDeleteRoute(request, context);
}
