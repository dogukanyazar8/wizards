import { mobileRoadmapVoteRoute, type MobileFeedbackRouteContext } from "../../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function PUT(request: Request, context: MobileFeedbackRouteContext) {
  return mobileRoadmapVoteRoute(request, context);
}
