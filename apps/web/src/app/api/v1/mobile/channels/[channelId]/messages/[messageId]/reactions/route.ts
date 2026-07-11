import {
  mobileChannelMessageReactionRoute,
  type MobileChannelMessageRouteContext,
} from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(request: Request, context: MobileChannelMessageRouteContext) {
  return mobileChannelMessageReactionRoute(request, context, true);
}

export async function DELETE(request: Request, context: MobileChannelMessageRouteContext) {
  return mobileChannelMessageReactionRoute(request, context, false);
}
