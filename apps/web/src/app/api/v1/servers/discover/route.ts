import { serverDiscoverRoute } from "./route-logic";

export function GET(request: Request) {
  return serverDiscoverRoute(request);
}
