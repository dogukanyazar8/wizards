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
  const detail = await getWorkspaceServerDetail(session.user.id, serverId);

  if (detail.server.defaultChannelId) {
    redirect(`/channels/${serverId}/${detail.server.defaultChannelId}`);
  }

  redirect("/channels/@me");
}
