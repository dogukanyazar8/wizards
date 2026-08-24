import { requireAuth } from "@/lib/auth/utils";
import { MessagesEmptyView } from "@/components/messages/messages-empty-view";

/**
 * `/messages` — SPEC-MESAJLAR §9 `view: empty`.
 *
 * Sohbet rayı kabuğun üçüncü sütununda duruyor ve hiçbir sohbet seçili değil.
 * `(main)` layout'u oturumu ve ban kontrolünü zaten yapıyor; buradaki
 * `requireAuth` yalnız görüntüleyenin kimliğini almak için.
 */
export const dynamic = "force-dynamic";

export default async function MessagesRoute() {
  const session = await requireAuth();

  return <MessagesEmptyView currentUserId={session.user.id} />;
}
