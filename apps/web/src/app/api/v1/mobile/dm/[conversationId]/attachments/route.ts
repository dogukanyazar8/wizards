import { mobileDMAttachmentsRoute, type MobileDMAttachmentsRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request, context: MobileDMAttachmentsRouteContext) {
  return mobileDMAttachmentsRoute(request, context);
}
