import { releaseListRoute } from "./route-logic";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return releaseListRoute(request);
}
