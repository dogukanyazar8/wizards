import { mobileAppUpdateRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request) {
  return mobileAppUpdateRoute(request);
}
