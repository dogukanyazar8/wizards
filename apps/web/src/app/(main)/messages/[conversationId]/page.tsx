import { requireAuth } from "@/lib/auth/utils";
import { DMConversationPage } from "@/components/dm/dm-conversation-page";

/**
 * `/messages/[conversationId]` — tek bir DM ya da grup sohbeti.
 *
 * Eskiden `/channels/@me/[channelId]` idi ve sunucu kanallarıyla **aynı**
 * sayfayı paylaşıyordu: bir `if (serverId === "@me")` dalı iki tamamen farklı
 * ekranı ayırıyordu. Ayrılınca kanal sayfası da yalnız kendi işini yapıyor.
 */
export const dynamic = "force-dynamic";

type MessagesConversationRouteProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function MessagesConversationRoute({
  params,
}: MessagesConversationRouteProps) {
  const session = await requireAuth();
  const { conversationId } = await params;

  const currentUserDisplayName =
    session.user.displayName ?? session.user.username ?? session.user.email ?? "Whispr";
  const currentUserUsername =
    session.user.username ?? session.user.email?.split("@")[0] ?? "whispr";

  return (
    <DMConversationPage
      conversationId={decodeURIComponent(conversationId)}
      currentUserDisplayName={currentUserDisplayName}
      currentUserId={session.user.id}
      currentUserUsername={currentUserUsername}
      uploadthingEnabled={Boolean(process.env.UPLOADTHING_TOKEN)}
    />
  );
}
