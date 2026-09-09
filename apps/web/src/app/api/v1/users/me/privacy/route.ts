import { messagingPrivacyReadRoute, messagingPrivacyUpdateRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request) {
  return messagingPrivacyReadRoute(request);
}

export function PATCH(request: Request) {
  return messagingPrivacyUpdateRoute(request);
}
