import {
  mobileChannelMessageDeleteRoute,
  mobileChannelMessageEditRoute,
  type MobileChannelMessageRouteContext,
} from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: Request, context: MobileChannelMessageRouteContext) {
  return mobileChannelMessageEditRoute(request, context);
}

export async function DELETE(request: Request, context: MobileChannelMessageRouteContext) {
  return mobileChannelMessageDeleteRoute(request, context);
}
