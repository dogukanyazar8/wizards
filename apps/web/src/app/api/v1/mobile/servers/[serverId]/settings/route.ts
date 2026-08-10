import {
  mobileServerUserSettingsUpdateRoute,
  type MobileServerUserSettingsRouteContext,
} from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function PATCH(request: Request, context: MobileServerUserSettingsRouteContext) {
  return mobileServerUserSettingsUpdateRoute(request, context);
}
