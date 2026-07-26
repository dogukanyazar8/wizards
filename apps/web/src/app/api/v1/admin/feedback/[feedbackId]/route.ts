import {
  adminFeedbackDetailRoute,
  adminFeedbackUpdateRoute,
  type AdminFeedbackRouteContext,
} from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: AdminFeedbackRouteContext) {
  return adminFeedbackDetailRoute(request, context);
}

export function PATCH(request: Request, context: AdminFeedbackRouteContext) {
  return adminFeedbackUpdateRoute(request, context);
}
