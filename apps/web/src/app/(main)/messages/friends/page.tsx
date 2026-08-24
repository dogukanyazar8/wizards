import { requireAuth } from "@/lib/auth/utils";
import { FriendsView } from "@/components/friends/friends-view";

/**
 * `/messages/friends` — Arkadaşlar paneli (SPEC-MESAJLAR §4).
 *
 * **Statik** segment: App Router statik segmenti dinamik olandan önce
 * eşleştirir, o yüzden `friends` adında bir konuşma kimliği bile bu sayfayı
 * gölgeleyemez.
 *
 * `(main)` layout'u oturumu ve ban kontrolünü yapıyor; buradaki `requireAuth`
 * yalnız görüntüleyenin kimliğini almak için — `Son etkileşim` sıralaması bir
 * 1:1 sohbetin karşı tarafını "benden başkası" diye buluyor.
 */
export const dynamic = "force-dynamic";

export default async function MessagesFriendsRoute() {
  const session = await requireAuth();

  return <FriendsView currentUserId={session.user.id} />;
}
