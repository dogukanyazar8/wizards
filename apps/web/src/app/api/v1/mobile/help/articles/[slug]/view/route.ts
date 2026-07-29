import { mobileHelpArticleViewRoute, type MobileHelpArticleViewRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request, context: MobileHelpArticleViewRouteContext) {
  return mobileHelpArticleViewRoute(request, context);
}
