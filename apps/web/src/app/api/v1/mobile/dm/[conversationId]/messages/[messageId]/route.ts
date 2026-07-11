import {
  mobileDMMessageDeleteRoute,
  mobileDMMessageEditRoute,
  type MobileDMMessageRouteContext,
} from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: Request, context: MobileDMMessageRouteContext) {
  return mobileDMMessageEditRoute(request, context);
}

export async function DELETE(request: Request, context: MobileDMMessageRouteContext) {
  return mobileDMMessageDeleteRoute(request, context);
}
