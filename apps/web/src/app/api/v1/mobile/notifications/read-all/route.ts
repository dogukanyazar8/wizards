import { mobileNotificationMarkAllReadRoute } from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: Request) {
  return mobileNotificationMarkAllReadRoute(request);
}
