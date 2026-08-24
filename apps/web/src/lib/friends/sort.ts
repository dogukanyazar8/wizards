import type { FriendsSort } from "@wizards/types";

/**
 * Arkadaşlar listesinin sıralaması — SPEC §4, karar #8.
 *
 * Saf: React yok, `Date.now()` yok. "Son etkileşim" için gereken zaman damgası
 * **girdi** olarak gelir, çünkü sohbet listesinden türer ve bileşenin içinde
 * okunan bir saat testte dondurulamaz.
 */

/** Çevrimiçi önce, sonra boşta, sonra rahatsız etmeyin, en sonda çevrimdışı. */
const PRESENCE_RANK: Readonly<Record<string, number>> = Object.freeze({
  ONLINE: 0,
  IDLE: 1,
  DND: 2,
  OFFLINE: 3,
});

export type SortableFriend = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
};

/**
 * Türkçe harf sırası. `Intl.Collator("tr")` olmadan `Çelik` `Demir`'den **sonra**
 * gelirdi: `Ç` Unicode'da `Z`'den sonra oturuyor ve varsayılan karşılaştırma kod
 * noktasına bakıyor.
 */
const COLLATOR = new Intl.Collator("tr", { sensitivity: "base" });

function byName(left: SortableFriend, right: SortableFriend): number {
  return COLLATOR.compare(left.name, right.name) || left.id.localeCompare(right.id);
}

export type FriendSortContext = {
  /**
   * Arkadaş kimliği → son mesajlaşma anı (ms). Hiç konuşulmamışsa anahtar yok.
   * Sohbet listesinden gelir; bu modül veri çekmez.
   */
  readonly lastInteractionAt: ReadonlyMap<string, number>;
};

/**
 * Sıralama **kararlıdır**: her dalda eşitlik ada, adda eşitlik kimliğe düşer.
 * Kararsız bir sıra, aynı listeyi iki kez çizen bir render'da satırların yer
 * değiştirmesi demek olurdu.
 */
export function sortFriends<T extends SortableFriend>(
  friends: readonly T[],
  sort: FriendsSort,
  context: FriendSortContext,
): T[] {
  const rows = [...friends];

  if (sort === "name") {
    return rows.sort(byName);
  }

  if (sort === "recent") {
    return rows.sort((left, right) => {
      const leftAt = context.lastInteractionAt.get(left.id) ?? 0;
      const rightAt = context.lastInteractionAt.get(right.id) ?? 0;

      // Hiç konuşulmamışlar (0) sona düşer ve kendi aralarında ada göre sıralanır.
      return rightAt - leftAt || byName(left, right);
    });
  }

  return rows.sort(
    (left, right) =>
      (PRESENCE_RANK[left.status] ?? PRESENCE_RANK.OFFLINE!) -
        (PRESENCE_RANK[right.status] ?? PRESENCE_RANK.OFFLINE!) || byName(left, right),
  );
}

/**
 * SPEC §4'ün iki bölümü: `Çevrimiçi` ve `Çevrimdışı`.
 *
 * `IDLE` ve `DND` **çevrimiçi** sayılır — tasarımın "5 çevrimiçi" sayacı Zeynep'i
 * (odak modu) ve Emre'yi (rahatsız etmeyin) de içeriyor. İkisi de uygulamada
 * açık; yalnız durum metinleri farklı.
 */
export function splitFriendsByPresence<T extends SortableFriend>(
  friends: readonly T[],
): { offline: T[]; online: T[] } {
  return {
    offline: friends.filter((friend) => friend.status === "OFFLINE"),
    online: friends.filter((friend) => friend.status !== "OFFLINE"),
  };
}

/**
 * Ad, kullanıcı adı ve ortak sunucu adında arar.
 *
 * `toLocaleLowerCase("tr")` şart: `I` harfini İngilizce kuralla küçültmek
 * `İstanbul` yazan birinin `istanbul` aramasında sonuç bulamaması demek.
 */
export function filterFriends<T extends { id: string; name: string; username: string }>(
  friends: readonly T[],
  query: string,
  mutualServerNames: ReadonlyMap<string, readonly string[]> = new Map(),
): T[] {
  const needle = query.trim().toLocaleLowerCase("tr");

  if (needle.length === 0) {
    return [...friends];
  }

  return friends.filter((friend) => {
    const servers = mutualServerNames.get(friend.id) ?? [];

    return [friend.name, friend.username, ...servers]
      .join(" ")
      .toLocaleLowerCase("tr")
      .includes(needle);
  });
}
