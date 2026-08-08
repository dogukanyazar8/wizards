import { mobileServerDiscoverRoute } from "./route-logic";

export function GET(request: Request) {
  return mobileServerDiscoverRoute(request);
}
