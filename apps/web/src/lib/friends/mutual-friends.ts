import { prisma, type PrismaClient } from "@wizards/db";

/**
 * Ortak arkadaşlar — SPEC §15.3.5.
 *
 * `FriendRequest` arkadaşlığı iki yönlü tek satırda taşıyor (`ACCEPTED`), ayrı bir
 * `Friendship` modeli yok. "İki tarafın arkadaş kümesinin kesişimi" bu yüzden
 * **iki liste çekip JS'te kesiştirmek** değil, `User` üzerinden iki ilişkisel
 * filtrenin `AND`'i olarak yazılır: PostgreSQL `friendRequestsSent` /
 * `friendRequestsReceived` indekslerini kullanır ve yalnız önizleme kadar satır
 * döner. 5.000 arkadaşı olan iki hesapta ilk yaklaşım 10.000 satırı Node'a
 * taşırdı; bu yaklaşım `take` kadarını taşır.
 *
 * Emsal: `lib/social/mobile-user-profile-service.ts` içindeki (dışa açılmamış)
 * `getMutualFriends`. Aynı `where` şekli bilerek kopyalandı — mobil profil kartı
 * ile Mesajlar profil paneli aynı soruya iki farklı cevap veremez. O dosya bu
 * şeridin yazma listesinde olmadığı için ortak yardımcıya **indirgenmedi**;
 * indirgeme ayrı bir iş olarak önerilir.
 */

/** Panelin çizdiği dört satır + "ve N kişi daha" için bir fazlası. */
export const MUTUAL_FRIEND_PREVIEW_COUNT = 4;
export const MUTUAL_FRIEND_DEFAULT_LIMIT = MUTUAL_FRIEND_PREVIEW_COUNT + 1;

export type MutualFriendUser = {
  readonly displayName: string | null;
  readonly id: string;
  readonly username: string;
};

export type MutualFriendsResult = {
  /**
   * Kesişimin **tamamı**, önizlemenin uzunluğu değil: "ve N kişi daha" cümlesi
   * ancak gerçek toplamdan türetilirse doğru olur.
   */
  readonly total: number;
  readonly users: readonly MutualFriendUser[];
};

/**
 * Testin gerçek bir veritabanı olmadan koşabilmesi için dar bir yüzey.
 * `badge-service.ts`'in `BadgeStore`'u ile aynı kalıp.
 */
export type MutualFriendStore = {
  user: Pick<PrismaClient["user"], "count" | "findMany">;
};

const defaultStore = prisma as unknown as MutualFriendStore;

/**
 * "Bu kişiyle arkadaş" koşulu. Arkadaşlık satırı hangi yönde açıldıysa orada
 * duruyor, o yüzden iki ilişki de sorulur.
 */
function connectedTo(peerId: string) {
  return {
    OR: [
      { friendRequestsSent: { some: { receiverId: peerId, status: "ACCEPTED" as const } } },
      { friendRequestsReceived: { some: { senderId: peerId, status: "ACCEPTED" as const } } },
    ],
  };
}

/**
 * İki tarafın da arkadaşı olan hesaplar. `id: { notIn: [...] }` iki kişinin
 * kendilerini dışarıda tutar — bir kişi kendi kendisinin arkadaşı olamaz ama
 * karşı taraf kesişimin içinde görünürdü.
 */
export function buildMutualFriendsWhere(viewerId: string, otherUserId: string) {
  return {
    AND: [connectedTo(viewerId), connectedTo(otherUserId)],
    deletedAt: null,
    id: { notIn: [viewerId, otherUserId] },
  };
}

export async function getMutualFriends(
  viewerId: string,
  otherUserId: string,
  limit: number = MUTUAL_FRIEND_DEFAULT_LIMIT,
  store: MutualFriendStore = defaultStore,
): Promise<MutualFriendsResult> {
  if (!viewerId || !otherUserId || viewerId === otherUserId) {
    return { total: 0, users: [] };
  }

  const take = Math.max(0, Math.trunc(limit));
  const where = buildMutualFriendsWhere(viewerId, otherUserId);
  const [total, users] = await Promise.all([
    store.user.count({ where }),
    take === 0
      ? Promise.resolve([])
      : store.user.findMany({
          orderBy: [{ username: "asc" }],
          select: { displayName: true, id: true, username: true },
          take,
          where,
        }),
  ]);

  return { total, users };
}
