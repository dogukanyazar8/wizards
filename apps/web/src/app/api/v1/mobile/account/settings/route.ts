import { mobileAccountSettingsGetRoute, mobileAccountSettingsUpdateRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request) {
  return mobileAccountSettingsGetRoute(request);
}

export function PATCH(request: Request) {
  return mobileAccountSettingsUpdateRoute(request);
}
