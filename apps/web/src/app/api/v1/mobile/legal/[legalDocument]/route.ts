import { mobileLegalDocumentRoute, type MobileLegalDocumentRouteContext } from "./route-logic";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: MobileLegalDocumentRouteContext) {
  return mobileLegalDocumentRoute(request, context);
}
