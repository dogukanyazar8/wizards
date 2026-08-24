import { discoverServersRoute } from "./route-logic";

export function GET(request: Request) {
  return discoverServersRoute(request);
}
