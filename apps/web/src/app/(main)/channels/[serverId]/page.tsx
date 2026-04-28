import { FriendsView } from "@/components/friends/friends-view";

type ServerPageProps = {
  params: Promise<{
    serverId: string;
  }>;
};

export default async function ServerPage({ params }: ServerPageProps) {
  const { serverId } = await params;

  if (decodeURIComponent(serverId) === "@me") {
    return <FriendsView />;
  }

  return null;
}
