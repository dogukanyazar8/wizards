import { ChannelType, prisma } from "@wizards/db";
import { permanentRedirect, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/utils";
import { MESSAGES_ROUTE, toMessagesRedirect } from "@/lib/messages/routes";
import { ChannelConversationPage } from "@/components/chat/channel-conversation-page";
import { VoiceChannelView } from "@/components/voice/voice-channel-view";
import {
  PermissionBits,
  canUseLockedChannelPermission,
  hasPermission,
  resolveChannelPermissions,
} from "@/lib/workspace/permissions";
import { getServerMediaSettings } from "@/lib/workspace/server-features";

type PageParams = {
  params: Promise<{
    serverId: string;
    channelId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ChannelPage({ params, searchParams }: PageParams) {
  const session = await requireAuth();
  const { serverId, channelId } = await params;
  const normalizedServerId = decodeURIComponent(serverId);

  const currentUserDisplayName =
    session.user.displayName ?? session.user.username ?? session.user.email ?? "Whispr";
  const currentUserUsername =
    session.user.username ?? session.user.email?.split("@")[0] ?? "whispr";
  const uploadthingEnabled = Boolean(process.env.UPLOADTHING_TOKEN);

  // Eski DM yolu. Sohbet artık `/messages/[conversationId]`; `?message=` gibi
  // derin bağlantı sorguları yönlendirmede korunur.
  if (normalizedServerId === "@me") {
    permanentRedirect(toMessagesRedirect(channelId, await searchParams));
  }

  const [channel, membership] = await Promise.all([
    prisma.channel.findFirst({
      where: {
        id: channelId,
        parentId: null,
        serverId: normalizedServerId,
      },
      select: {
        id: true,
        locked: true,
        name: true,
        permissionOverrides: {
          select: {
            allow: true,
            deny: true,
            targetId: true,
            targetType: true,
          },
        },
        server: {
          select: {
            features: true,
            messageCharacterLimit: true,
          },
        },
        topic: true,
        type: true,
      },
    }),
    prisma.serverMember.findFirst({
      where: {
        serverId: normalizedServerId,
        server: {
          bans: {
            none: {
              userId: session.user.id,
            },
          },
        },
        userId: session.user.id,
      },
      select: {
        id: true,
        server: {
          select: {
            ownerId: true,
            roles: {
              where: { isDefault: true },
              select: {
                id: true,
                isDefault: true,
                name: true,
                permissions: true,
              },
            },
          },
        },
        roles: {
          select: {
            role: {
              select: {
                id: true,
                isDefault: true,
                name: true,
                permissions: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!membership) {
    redirect(MESSAGES_ROUTE);
  }

  if (!channel) {
    redirect(`/channels/${normalizedServerId}`);
  }

  const permissionContext = {
    memberId: membership.id,
    ownerId: membership.server.ownerId,
    roles: [...membership.server.roles, ...membership.roles.map((entry) => entry.role)],
    userId: session.user.id,
    overrides: channel.permissionOverrides,
  };
  const channelPermissions = resolveChannelPermissions(permissionContext);

  if (!hasPermission(channelPermissions, PermissionBits.VIEW_CHANNEL)) {
    redirect(`/channels/${normalizedServerId}`);
  }

  if (channel.type === ChannelType.VOICE) {
    const canConnectVoice =
      hasPermission(channelPermissions, PermissionBits.CONNECT_VOICE) &&
      (!channel.locked ||
        canUseLockedChannelPermission(permissionContext, PermissionBits.CONNECT_VOICE));

    if (!canConnectVoice) {
      redirect(`/channels/${normalizedServerId}`);
    }

    return <VoiceChannelView channelId={channelId} serverId={normalizedServerId} />;
  }

  const mediaSettings = getServerMediaSettings(channel.server?.features ?? []);

  return (
    <ChannelConversationPage
      allowFileUploads={mediaSettings.allowFileUploads}
      allowGifs={mediaSettings.allowGifs}
      messageCharacterLimit={channel.server?.messageCharacterLimit ?? 2000}
      channelId={channelId}
      channelLocked={channel.locked}
      channelReadOnly={!hasPermission(channelPermissions, PermissionBits.SEND_MESSAGES)}
      channelName={channel.name}
      channelTopic={channel.topic}
      serverId={normalizedServerId}
      currentUserId={session.user.id}
      currentUserDisplayName={currentUserDisplayName}
      currentUserUsername={currentUserUsername}
      uploadthingEnabled={uploadthingEnabled}
      canModerate={hasPermission(channelPermissions, PermissionBits.MANAGE_MESSAGES)}
    />
  );
}
