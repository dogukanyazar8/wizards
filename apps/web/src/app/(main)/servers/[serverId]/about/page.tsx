import { ServerProfileCard } from "@/components/servers/server-profile-card";

type ServerProfilePageProps = {
  params: Promise<{
    serverId: string;
  }>;
};

export default async function ServerProfilePage({ params }: ServerProfilePageProps) {
  const { serverId } = await params;

  return <ServerProfileCard serverId={decodeURIComponent(serverId)} />;
}
