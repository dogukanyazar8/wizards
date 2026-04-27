import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/utils";
import { prisma } from "@wizards/db";
import { ChannelConversationPage } from "@/components/chat/channel-conversation-page";
import { DMConversationPage } from "@/components/dm/dm-conversation-page";

const SERVER_ADMIN_PERMISSION =
  (1n << 0n) |
  (1n << 1n) |
  (1n << 2n) |
  (1n << 3n);

function hasAdminAccess(
  roles: Array<{
    role: {
      name: string;
      permissions: bigint;
    };
  }>,
) {
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

  if (normalizedServerId === "@me") {
    return (
      <DMConversationPage
        conversationId={channelId}
        currentUserDisplayName={currentUserDisplayName}
        currentUserId={session.user.id}
        currentUserUsername={currentUserUsername}
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
      },
    }),
    prisma.serverMember.findFirst({
      where: {
        serverId: normalizedServerId,
        userId: session.user.id,
      },
      select: {
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

  return (
    <ChannelConversationPage
      channelId={channelId}
      serverId={normalizedServerId}
      currentUserId={session.user.id}
      currentUserDisplayName={currentUserDisplayName}
      currentUserUsername={currentUserUsername}
      canModerate={hasAdminAccess(membership.roles)}
    />
  );
}
