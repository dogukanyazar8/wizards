import {
  mobileGroupDefaults,
  mobileGroupMemberRoleRoute,
  mobileGroupRemoveMemberRoute,
} from "../../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ conversationId: string; userId: string }> },
) {
  const { conversationId, userId } = await context.params;
  return mobileGroupRemoveMemberRoute(request, conversationId, userId, mobileGroupDefaults);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ conversationId: string; userId: string }> },
) {
  const { conversationId, userId } = await context.params;
  return mobileGroupMemberRoleRoute(request, conversationId, userId, mobileGroupDefaults);
}
