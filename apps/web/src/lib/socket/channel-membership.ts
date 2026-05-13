import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

export async function ensureChannelMembership(userId: string, channelId: string) {
  const { channel } = await requireChannelPermissionForUser(
    userId,
    channelId,
    PermissionBits.VIEW_CHANNEL,
    {
      forbiddenCode: "FORBIDDEN",
      forbiddenMessage: "You do not have access to this channel.",
    },
  );

  return {
    channelId,
    serverId: channel.serverId,
  };
}
