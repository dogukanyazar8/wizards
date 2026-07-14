import { mobileNotificationMarkReadRoute } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  return mobileNotificationMarkReadRoute(request, context);
}
