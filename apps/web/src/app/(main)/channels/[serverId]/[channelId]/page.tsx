import { ChannelType, prisma } from "@wizards/db";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/utils";
import { ChannelConversationPage } from "@/components/chat/channel-conversation-page";
import { DMConversationPage } from "@/components/dm/dm-conversation-page";
import { VoiceChannelView } from "@/components/voice/voice-channel-view";

const SERVER_ADMIN_PERMISSION =
  (1n << 0n) |
  (1n << 1n) |
  (1n << 2n) |
  (1n << 3n);

function hasAdminAccess(
  ownerId: string,
  userId: string,
  roles: Array<{
    role: {
      name: string;
      permissions: bigint;
    };
  }>,
) {
  if (ownerId === userId) {
    return true;
  }

  return roles.some(
    ({ role }) =>
      (role.permissions & SERVER_ADMIN_PERMISSION) !== 0n ||
      /admin|moderator/i.test(role.name),
  );
}

type PageParams = {
  params: Promise<{
    serverId: string;
    channelId: string;
  }>;
};

export default async function ChannelPage({ params }: PageParams) {
  const session = await requireAuth();
  const { serverId, channelId } = await params;
  const normalizedServerId = decodeURIComponent(serverId);

  const currentUserDisplayName =
    session.user.displayName ?? session.user.username ?? session.user.email ?? "Wizard";
  const currentUserUsername =
    session.user.username ?? session.user.email?.split("@")[0] ?? "wizard";
  const uploadthingEnabled = Boolean(process.env.UPLOADTHING_TOKEN);

  if (normalizedServerId === "@me") {
    return (
      <DMConversationPage
        conversationId={channelId}
        currentUserDisplayName={currentUserDisplayName}
        currentUserId={session.user.id}
        currentUserUsername={currentUserUsername}
        uploadthingEnabled={uploadthingEnabled}
      />
    );
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
        name: true,
        topic: true,
        type: true,
      },
    }),
    prisma.serverMember.findFirst({
      where: {
        serverId: normalizedServerId,
        userId: session.user.id,
      },
      select: {
        server: {
          select: {
            ownerId: true,
          },
        },
        roles: {
          select: {
            role: {
              select: {
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
    redirect("/channels");
  }

  if (!channel) {
    redirect(`/channels/${normalizedServerId}`);
  }

  if (channel.type === ChannelType.VOICE) {
    return <VoiceChannelView channelId={channelId} serverId={normalizedServerId} />;
  }

  return (
    <ChannelConversationPage
      channelId={channelId}
      channelName={channel.name}
      channelTopic={channel.topic}
      serverId={normalizedServerId}
      currentUserId={session.user.id}
      currentUserDisplayName={currentUserDisplayName}
      currentUserUsername={currentUserUsername}
      uploadthingEnabled={uploadthingEnabled}
      canModerate={hasAdminAccess(
        membership.server.ownerId,
        session.user.id,
        membership.roles,
      )}
    />
  );
}
