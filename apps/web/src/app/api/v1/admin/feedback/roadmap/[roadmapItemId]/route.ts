import { adminRoadmapUpdateRoute, type AdminFeedbackRouteContext } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function PATCH(request: Request, context: AdminFeedbackRouteContext) {
  return adminRoadmapUpdateRoute(request, context);
}
