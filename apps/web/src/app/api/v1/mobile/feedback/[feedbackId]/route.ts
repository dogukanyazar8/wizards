import { mobileFeedbackDetailRoute, type MobileFeedbackRouteContext } from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileFeedbackRouteContext) {
  return mobileFeedbackDetailRoute(request, context);
}
