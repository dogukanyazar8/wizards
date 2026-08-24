import {
  MentionFilterSchema,
  MentionGroupingSchema,
  MentionWindowSchema,
  type MentionFilter,
  type MentionGrouping,
  type MentionWindow,
} from "@wizards/types";

/**
 * Bahsedilmeler ekranının rota durumu — tek doğruluk kaynağı **URL**'dir (PROMPT kural 8).
 *
 * Filtre, kaynak, gruplama, pencere ve arama React state'inde değil adres çubuğunda durur.
 * Bunun üç ölçülebilir sonucu var: durum paylaşılabilir, tarayıcının geri tuşu gerçekten
 * çalışır, ve sunucu ilk boyayı doğru filtreyle render eder — istemcinin bir efekt içinde
 * filtreyi "geri yüklemesini" beklemek yerine.
 *
 * Bağlam paneli de URL'e yazılır (`?panel=<mentionId>`): bir bahsetmenin bağlamı, gösterilecek
 * bir görünümdür ve bağlantısı gönderilebilir olmalıdır. Menü ve yanıt kutusu yazılmaz —
 * onlar bir tıklamanın anlık sonucudur, bir adres değil.
 *
 * Ayrıştırıcıların ortak kuralı: **tanınmayan değer varsayılana düşer, asla atmaz.** Elle
 * yazılmış ya da eskimiş bir adres boş ekran değil, varsayılan ekranı açar.
 */

export const MENTIONS_ROUTE = "/mentions";

/** Rayın "Kaynağa göre" listesinde DM'lerin kimliği. Sunucu kimliği olamaz. */
export const MENTIONS_DM_SOURCE = "dm";

export const MENTIONS_DEFAULT_FILTER: MentionFilter = "all";
export const MENTIONS_DEFAULT_GROUPING: MentionGrouping = "time";
export const MENTIONS_DEFAULT_WINDOW: MentionWindow = "30d";

/** Sunucu kimlikleri uuid; adres çubuğuna sığmayacak kadar uzun bir değer kaynak olamaz. */
const MAX_SOURCE_LENGTH = 64;
/** Arama sunucuda `ILIKE` ile koşuyor; sınırsız uzunluk sınırsız iş demek. */
const MAX_QUERY_LENGTH = 120;

export type MentionsRouteState = {
  readonly filter: MentionFilter;
  /** Sunucu kimliği ya da `"dm"`; seçim yoksa `null`. */
  readonly source: string | null;
  readonly grouping: MentionGrouping;
  readonly window: MentionWindow;
  /** Arama metni; boşsa `null`. */
  readonly query: string | null;
  /** Bağlam panelinin gösterdiği bahsetme kimliği (`"<source>:<refId>"`). */
  readonly panel: string | null;
  readonly settingsOpen: boolean;
};

export const MENTIONS_DEFAULT_ROUTE_STATE: MentionsRouteState = {
  filter: MENTIONS_DEFAULT_FILTER,
  source: null,
  grouping: MENTIONS_DEFAULT_GROUPING,
  window: MENTIONS_DEFAULT_WINDOW,
  query: null,
  panel: null,
  settingsOpen: false,
};

export function parseMentionFilter(value: string | null | undefined): MentionFilter {
  const parsed = MentionFilterSchema.safeParse(value);
  return parsed.success ? parsed.data : MENTIONS_DEFAULT_FILTER;
}

export function parseMentionGrouping(value: string | null | undefined): MentionGrouping {
  const parsed = MentionGroupingSchema.safeParse(value);
  return parsed.success ? parsed.data : MENTIONS_DEFAULT_GROUPING;
}

export function parseMentionWindow(value: string | null | undefined): MentionWindow {
  const parsed = MentionWindowSchema.safeParse(value);
  return parsed.success ? parsed.data : MENTIONS_DEFAULT_WINDOW;
}

export function parseMentionSource(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_SOURCE_LENGTH ? trimmed : null;
}

export function parseMentionQuery(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.length > MAX_QUERY_LENGTH ? trimmed.slice(0, MAX_QUERY_LENGTH) : trimmed;
}

/** `URLSearchParams` ve `ReadonlyURLSearchParams` ortak yüzeyi. */
type ReadableParams = { get(name: string): string | null };

export function parseMentionsRouteState(params: ReadableParams): MentionsRouteState {
  return {
    filter: parseMentionFilter(params.get("filter")),
    source: parseMentionSource(params.get("source")),
    grouping: parseMentionGrouping(params.get("group")),
    window: parseMentionWindow(params.get("window")),
    query: parseMentionQuery(params.get("q")),
    panel: params.get("panel") ?? null,
    settingsOpen: params.get("modal") === "settings",
  };
}

/**
 * Durumu adrese yazar. **Varsayılan değerler yazılmaz**: `/mentions?filter=all&group=time`
 * ile `/mentions` aynı ekranı gösterir ve iki farklı adres aynı şeyi anlatırsa paylaşılan
 * bağlantı hangisinin "doğru" olduğunu söyleyemez.
 *
 * Anahtar sırası sabittir, çünkü aynı durumun her seferinde aynı dizeyi üretmesi geri tuşunu
 * öngörülebilir yapar.
 */
export function buildMentionsHref(state: Partial<MentionsRouteState> = {}): string {
  const next = { ...MENTIONS_DEFAULT_ROUTE_STATE, ...state };
  const params = new URLSearchParams();

  if (next.filter !== MENTIONS_DEFAULT_FILTER) {
    params.set("filter", next.filter);
  }

  if (next.source) {
    params.set("source", next.source);
  }

  if (next.grouping !== MENTIONS_DEFAULT_GROUPING) {
    params.set("group", next.grouping);
  }

  if (next.window !== MENTIONS_DEFAULT_WINDOW) {
    params.set("window", next.window);
  }

  if (next.query) {
    params.set("q", next.query);
  }

  if (next.panel) {
    params.set("panel", next.panel);
  }

  if (next.settingsOpen) {
    params.set("modal", "settings");
  }

  const search = params.toString();
  return search.length > 0 ? `${MENTIONS_ROUTE}?${search}` : MENTIONS_ROUTE;
}

/**
 * Ray satırı ve sekme davranışı: seçili olana tekrar basmak seçimi kaldırır (SPEC §9).
 * Kural iki yerde tekrar edilmesin diye burada.
 */
export function toggleMentionFilter(current: MentionFilter, next: MentionFilter): MentionFilter {
  return current === next ? MENTIONS_DEFAULT_FILTER : next;
}

export function toggleMentionSource(current: string | null, next: string): string | null {
  return current === next ? null : next;
}
