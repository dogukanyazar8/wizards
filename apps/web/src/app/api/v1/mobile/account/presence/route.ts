import { mobilePresenceUpdateRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function PUT(request: Request) {
  return mobilePresenceUpdateRoute(request);
}
