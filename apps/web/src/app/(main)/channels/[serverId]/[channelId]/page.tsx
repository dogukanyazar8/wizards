import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/utils";
import { getWorkspaceServerDetail } from "@/lib/workspace/service";
import { ChatArea } from "@/components/chat/chat-area";

type PageParams = {
  params: Promise<{
    serverId: string;
    channelId: string;
  }>;
};

export default async function ChannelPage({ params }: PageParams) {
  const session = await requireAuth();
  const { serverId, channelId } = await params;

  const detail = await getWorkspaceServerDetail(session.user.id, serverId);

  const channel = [
    ...detail.ungroupedChannels,
    ...detail.categories.flatMap((c) => c.channels),
  ].find((ch) => ch.id === channelId);

  if (!channel) {
    redirect(`/channels/${serverId}`);
  }

  return (
    <ChatArea
      channelId={channelId}
      currentUserId={session.user.id}
      canModerate={detail.server.isAdmin}
    />
  );
}
