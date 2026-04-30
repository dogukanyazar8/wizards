import { FriendsView } from "@/components/friends/friends-view";
import { requireAuth } from "@/lib/auth/utils";

type ServerPageProps = {
  params: Promise<{
    serverId: string;
  }>;
};

export default async function ServerPage({ params }: ServerPageProps) {
  const { serverId } = await params;

  if (decodeURIComponent(serverId) === "@me") {
    const session = await requireAuth();

    return <FriendsView currentUserId={session.user.id} />;
  }

  return null;
}
