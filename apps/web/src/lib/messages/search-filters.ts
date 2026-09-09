/**
 * Kanal arama panelinin gelişmiş alan seti — SPEC-SUNUCU §4.3.
 *
 * Tasarım altı kontrol çiziyor: `KİMDEN` · `KANAL` · `TARİH ARALIĞI` · dört `İÇERİYOR` çipi ·
 * `Yalnızca thread yanıtlarında ara` anahtarı. Uç
 * (`GET /api/v1/channels/[channelId]/messages/search`) bunların **hepsini** desteklemiyor ve
 * bu dosya farkı tek yerde tutar:
 *
 * | Kontrol | Karşılığı |
 * | --- | --- |
 * | `KİMDEN` | `author` — `username`/`displayName` üstünde `ILIKE` |
 * | `KANAL` | ucun yolundaki `channelId`; parametre değil, **adres** değişir |
 * | `TARİH ARALIĞI` | `from` (ISO) — hazır aralıklar `now - N gün` olarak hesaplanır |
 * | `İÇERİYOR` çipleri | **desteklenmiyor** — `TODO(api)` |
 * | Thread anahtarı | **desteklenmiyor** — `TODO(api)` |
 *
 * TODO(api): `İÇERİYOR` çipleri (`Dosya`/`Bağlantı`/`Görsel`/`Sabitlenmiş`) için uçta karşılık
 * yok. `searchChannelMessages` yalnız `Message.content` üstünde eşleşiyor; ek/bağlantı/görsel
 * varlığı ve `pinned` bayrağı sorguya hiç girmiyor. Çipleri istemcide uygulamak da mümkün değil:
 * `MessageSearchResult` bu alanları taşımıyor, dolayısıyla sonuç kartındaki `Dosya ekli` /
 * `Sabitlenmiş` etiketi de çizilemiyor.
 *
 * TODO(api): `Yalnızca thread yanıtlarında ara` uçta **imkânsız**, eksik değil: sorgu
 * `m."threadParentId" IS NULL AND m."threadId" IS NULL` ile thread yanıtlarını baştan dışarıda
 * bırakıyor. Anahtar açıkken uydurma bir parametre göndermek her aramayı boş döndürürdü.
 *
 * İki kontrol de arayüzde **çizilir** (SPEC'in alan seti eksiksiz görünür) ama sorguya
 * girmez; panel bunun yerine "bu filtre henüz sonucu daraltmıyor" uyarısını gösterir.
 * Uydurma parametre göndermek, kullanıcıya daralmış bir sonuç listesi gösterip aslında
 * daraltmamak demek olurdu.
 */

export const MESSAGE_SEARCH_CONTENT_TAGS = ["file", "link", "image", "pinned"] as const;

export type MessageSearchContentTag = (typeof MESSAGE_SEARCH_CONTENT_TAGS)[number];

export const MESSAGE_SEARCH_DATE_RANGES = ["all", "24h", "7d", "30d", "90d"] as const;

export type MessageSearchDateRange = (typeof MESSAGE_SEARCH_DATE_RANGES)[number];

/** Hazır aralığın gün karşılığı; `all` sınırsızdır. */
const DATE_RANGE_DAYS: Record<MessageSearchDateRange, number | null> = {
  "24h": 1,
  "30d": 30,
  "7d": 7,
  "90d": 90,
  all: null,
};

export type MessageSearchFormState = {
  /** Boş dizi = `Herkes`. */
  readonly author: string;
  readonly contentTags: readonly MessageSearchContentTag[];
  readonly dateRange: MessageSearchDateRange;
  readonly exact: boolean;
  readonly threadOnly: boolean;
};

export const EMPTY_MESSAGE_SEARCH_FORM: MessageSearchFormState = {
  author: "",
  contentTags: [],
  dateRange: "all",
  exact: false,
  threadOnly: false,
};

/** Uçta karşılığı olmayan kontroller. Panel bunları uyarı satırında adlandırır. */
export type UnsupportedMessageSearchFilter = "contentTags" | "threadOnly";

export function collectUnsupportedFilters(
  form: MessageSearchFormState,
): readonly UnsupportedMessageSearchFilter[] {
  const unsupported: UnsupportedMessageSearchFilter[] = [];

  if (form.contentTags.length > 0) {
    unsupported.push("contentTags");
  }

  if (form.threadOnly) {
    unsupported.push("threadOnly");
  }

  return unsupported;
}

export function toggleContentTag(
  tags: readonly MessageSearchContentTag[],
  tag: MessageSearchContentTag,
): readonly MessageSearchContentTag[] {
  return tags.includes(tag) ? tags.filter((entry) => entry !== tag) : [...tags, tag];
}

/**
 * Hazır aralığın alt sınırı. `to` hiç üretilmez: beş aralığın beşi de "şu ana kadar" demek ve
 * bir üst sınır göndermek, arama sırasında gelen yeni mesajı sessizce eleyip listeyi bayatlatırdı.
 */
export function resolveDateRangeStart(range: MessageSearchDateRange, now: number): string | null {
  const days = DATE_RANGE_DAYS[range];
  if (days === null) {
    return null;
  }

  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

export type MessageSearchRequestFilters = {
  readonly author: string | null;
  readonly exact: boolean;
  readonly from: string | null;
  readonly to: string | null;
};

/**
 * Forma karşılık gelen **gerçek** uç parametreleri. Desteklenmeyen kontroller buradan hiç
 * geçmez — `collectUnsupportedFilters` onları arayüz tarafında adlandırır.
 *
 * `basic` kipinde gelişmiş alanların hiçbiri gönderilmez: kullanıcı `Gelişmiş`ten `Basit`e
 * dönüp aramayı tekrarladığında, göremediği bir alanın sonucu daraltmaya devam etmesi
 * arama kutusunu açıklanamaz kılardı.
 */
export function buildMessageSearchFilters(
  form: MessageSearchFormState,
  mode: "advanced" | "basic",
  now: number,
): MessageSearchRequestFilters {
  if (mode === "basic") {
    return { author: null, exact: false, from: null, to: null };
  }

  const author = form.author.trim();

  return {
    author: author.length > 0 ? author : null,
    exact: form.exact,
    from: resolveDateRangeStart(form.dateRange, now),
    to: null,
  };
}

/** Sonuç başlığı `N SONUÇ` mu, `N SONUÇ · FİLTRELİ` mi (SPEC §4.3). */
export function isMessageSearchFiltered(
  form: MessageSearchFormState,
  mode: "advanced" | "basic",
): boolean {
  if (mode === "basic") {
    return false;
  }

  return (
    form.author.trim().length > 0 ||
    form.contentTags.length > 0 ||
    form.dateRange !== "all" ||
    form.exact ||
    form.threadOnly
  );
}

export type MessageSearchHighlightSegment = {
  readonly highlighted: boolean;
  readonly text: string;
};

/**
 * Eşleşen kelimenin `warning/.25` zeminle vurgulanması (SPEC §4.3).
 *
 * Vurgulama istemcide yapılır çünkü uç eşleşme aralığı döndürmüyor; `websearch_to_tsquery`
 * kök eşlemesi de yapabildiği için tam bir örtüşme garanti değil. Bu yüzden kural dar tutuldu:
 * yalnız sorgunun **birebir** (büyük/küçük harf duyarsız) geçtiği yerler işaretlenir. Daha
 * geniş bir tahmin, olmayan bir eşleşmeyi vurgulamak olurdu.
 */
export function buildHighlightSegments(
  content: string,
  query: string,
  locale: string,
): readonly MessageSearchHighlightSegment[] {
  const needle = query.trim();
  if (needle.length === 0) {
    return [{ highlighted: false, text: content }];
  }

  const haystack = content.toLocaleLowerCase(locale);
  const target = needle.toLocaleLowerCase(locale);
  const segments: MessageSearchHighlightSegment[] = [];
  let cursor = 0;

  for (;;) {
    const index = haystack.indexOf(target, cursor);
    if (index === -1) {
      break;
    }

    if (index > cursor) {
      segments.push({ highlighted: false, text: content.slice(cursor, index) });
    }

    segments.push({ highlighted: true, text: content.slice(index, index + needle.length) });
    cursor = index + needle.length;
  }

  if (cursor < content.length) {
    segments.push({ highlighted: false, text: content.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ highlighted: false, text: content }];
}
