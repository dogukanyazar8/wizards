import { adminRoadmapCreateRoute, adminRoadmapListRoute } from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request) {
  return adminRoadmapListRoute(request);
}

export function POST(request: Request) {
  return adminRoadmapCreateRoute(request);
}
