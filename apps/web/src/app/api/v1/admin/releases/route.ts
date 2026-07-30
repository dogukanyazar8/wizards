import { adminReleaseCreateRoute, adminReleaseListRoute } from "./route-logic";

export function GET(request: Request) {
  return adminReleaseListRoute(request);
}

export function POST(request: Request) {
  return adminReleaseCreateRoute(request);
}
