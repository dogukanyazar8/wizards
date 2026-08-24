import type { DiscoverCategoryKey, DiscoverLane, DiscoverSortKey } from "@wizards/types";

/**
 * Keşfet'in **sıra ve ton** sözleşmesi.
 *
 * Buradaki `tone` bir **token adıdır, renk değil**: tüketici `hsl(var(--${tone}))` kurar.
 * Sözlükte hex ya da hazır `hsl()` tutmak, temanın `theme-light`/`theme-dark` sınıflarıyla
 * gelmesini boşa çıkarırdı.
 *
 * Sıra bağlayıcıdır. Dizin kolonu, filtre şeridi ve katıl modalı aynı diziden okur; üç yerde
 * üç ayrı liste yazılsaydı biri bir gün `Kişisel` ile `Destek`i yer değiştirirdi.
 */

/** Keşfet'in kullandığı ton token'ları. `info` `--info` token'ıdır ve zaten tanımlıdır. */
export type DiscoverTone = "primary" | "warning" | "info" | "success" | "danger";

export type DiscoverCategoryContract = {
  readonly key: DiscoverCategoryKey;
  /** SPEC §3.1 tablosu — iki harfli tile metni. Addan türetilmez, sabittir. */
  readonly initials: string;
  readonly tone: DiscoverTone;
};

/** SPEC §3.1 — dizin kolonunun altı satırı, birebir bu sırada. */
export const DISCOVER_CATEGORIES = [
  { key: "all", initials: "TÜ", tone: "primary" },
  { key: "oyun", initials: "OY", tone: "warning" },
  { key: "is", initials: "İŞ", tone: "info" },
  { key: "calisma", initials: "ÇA", tone: "success" },
  { key: "kisisel", initials: "Kİ", tone: "primary" },
  { key: "destek", initials: "DE", tone: "danger" },
] as const satisfies readonly DiscoverCategoryContract[];

export type DiscoverSortContract = {
  readonly key: DiscoverSortKey;
  /** SPEC §3.2 — satırın 8 px noktası. */
  readonly tone: DiscoverTone;
};

/** SPEC §3.2 — `Popüler` · `En çok çevrimiçi` · `Yeni eklenenler`. */
export const DISCOVER_SORTS = [
  { key: "popular", tone: "primary" },
  { key: "online", tone: "success" },
  { key: "new", tone: "warning" },
] as const satisfies readonly DiscoverSortContract[];

/** SPEC §4.1 — şerit sekmelerinin sırası. */
export const DISCOVER_LANES = [
  "servers",
  "people",
  "channels",
  "events",
] as const satisfies readonly DiscoverLane[];

/**
 * K7: kart boyutu `localStorage`'da durur, URL'de değil. Bir görünüm tercihidir; paylaşılan
 * bağlantının karşı taraftaki kart boyutunu değiştirmesi beklenen davranış değildir.
 */
export const DISCOVER_CARD_SIZE_STORAGE_KEY = "wizards.discover.cardSize.v1";

/**
 * K4: `Yeni` etiketi sunucuya ilk giriş **veya** `joinedAt + 24 saat` — hangisi önceyse.
 * Yeni kolon açılmadı; "görüldü" kaydı burada durur.
 */
export const DISCOVER_SEEN_SERVERS_STORAGE_KEY = "wizards.discover.seenServers.v1";

/** K4 — `joinedAt` üzerinden geçen bu süre sonunda `Yeni` etiketi kendiliğinden düşer. */
export const DISCOVER_NEW_BADGE_TTL_MS = 24 * 60 * 60 * 1000;

/** K11 — öne çıkan bloğu süren bayrak. `Server.features` dizisinde durur. */
export const DISCOVER_FEATURED_FLAG = "FEATURED";
