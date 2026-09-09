import { userReportDefaults, userReportRoute, type UserReportRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request, context: UserReportRouteContext) {
  return userReportRoute(request, context, userReportDefaults);
}
