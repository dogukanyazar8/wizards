import { releaseDetailRoute } from "../route-logic";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return releaseDetailRoute(request, context);
}
