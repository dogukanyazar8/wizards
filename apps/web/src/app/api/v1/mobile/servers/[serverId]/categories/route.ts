import {
  mobileServerCategoryCreateRoute,
  type MobileServerCategoriesRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request, context: MobileServerCategoriesRouteContext) {
  return mobileServerCategoryCreateRoute(request, context);
}
