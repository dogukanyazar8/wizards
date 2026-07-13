import { mobileLinkPreviewRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export function POST(request: Request) {
  return mobileLinkPreviewRoute(request);
}
