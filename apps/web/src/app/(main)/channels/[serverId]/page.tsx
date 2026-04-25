import { redirect } from "next/navigation";
import { getWorkspaceServerDetail } from "@/lib/workspace/service";
import { requireAuth } from "@/lib/auth/utils";

type ServerPageProps = {
  params: Promise<{
    serverId: string;
  }>;
};

export default async function ServerPage({ params }: ServerPageProps) {
  const session = await requireAuth();
  const { serverId } = await params;
  const normalizedServerId = decodeURIComponent(serverId);

  if (normalizedServerId === "@me") {
    redirect("/channels");
  }

  const detail = await getWorkspaceServerDetail(session.user.id, normalizedServerId);

  if (detail.server.defaultChannelId) {
    redirect(`/channels/${normalizedServerId}/${detail.server.defaultChannelId}`);
  }

  redirect("/channels");
}
