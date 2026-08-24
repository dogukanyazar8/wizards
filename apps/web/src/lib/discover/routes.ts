import {
  DiscoverCategoryKeySchema,
  DiscoverLaneSchema,
  DiscoverSortKeySchema,
  type DiscoverCategoryKey,
  type DiscoverLane,
  type DiscoverSortKey,
} from "@wizards/types";

/**
 * Keşfet ekranının rota durumu — tek doğruluk kaynağı **URL**'dir (PROMPT kural 8, karar K12).
 *
 * Şerit, kategori, sıralama, arama, açık panel ve açık modal React state'inde değil adres
 * çubuğunda durur. Üç ölçülebilir sonucu var: durum paylaşılabilir, geri tuşu gerçekten
 * çalışır, ve sunucu ilk boyayı doğru filtreyle render eder — istemcinin bir efekt içinde
 * filtreyi "geri yüklemesini" beklemek yerine.
 *
 * Ayrıştırıcıların ortak kuralı: **tanınmayan değer varsayılana düşer, asla atmaz.** Elle
 * yazılmış ya da eskimiş bir adres boş ekran değil, varsayılan ekranı açar.
 */

export const DISCOVER_ROUTE = "/discover";

export const DISCOVER_DEFAULT_LANE: DiscoverLane = "servers";
export const DISCOVER_DEFAULT_CATEGORY: DiscoverCategoryKey = "all";
export const DISCOVER_DEFAULT_SORT: DiscoverSortKey = "popular";

/** Sunucu tarafındaki `DiscoverQuerySchema.q` ile aynı sınır; iki yerde ayrışmasın. */
const MAX_QUERY_LENGTH = 80;

/** Sunucu kimlikleri uuid; adres çubuğuna sığmayacak kadar uzun bir değer panel açamaz. */
const MAX_PANEL_ID_LENGTH = 64;

export type DiscoverModal = "join";

export type DiscoverRouteState = {
  readonly category: DiscoverCategoryKey;
  readonly lane: DiscoverLane;
  /** SPEC §6 katıl modalı. Panelle **aynı anda** bulunabilir. */
  readonly modal: DiscoverModal | null;
  /** SPEC §5 profil panelinin gösterdiği sunucu; kapalıysa `null`. */
  readonly panelServerId: string | null;
  /** Arama metni; boşsa `""`. */
  readonly q: string;
  readonly sort: DiscoverSortKey;
};

export const DISCOVER_DEFAULT_ROUTE_STATE: DiscoverRouteState = {
  category: DISCOVER_DEFAULT_CATEGORY,
  lane: DISCOVER_DEFAULT_LANE,
  modal: null,
  panelServerId: null,
  q: "",
  sort: DISCOVER_DEFAULT_SORT,
};

export function parseDiscoverLane(value: string | null | undefined): DiscoverLane {
  const parsed = DiscoverLaneSchema.safeParse(value);
  return parsed.success ? parsed.data : DISCOVER_DEFAULT_LANE;
}

export function parseDiscoverCategory(value: string | null | undefined): DiscoverCategoryKey {
  const parsed = DiscoverCategoryKeySchema.safeParse(value);
  return parsed.success ? parsed.data : DISCOVER_DEFAULT_CATEGORY;
}

export function parseDiscoverSort(value: string | null | undefined): DiscoverSortKey {
  const parsed = DiscoverSortKeySchema.safeParse(value);
  return parsed.success ? parsed.data : DISCOVER_DEFAULT_SORT;
}

export function parseDiscoverQuery(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();

  if (trimmed.length === 0) {
    return "";
  }

  return trimmed.length > MAX_QUERY_LENGTH ? trimmed.slice(0, MAX_QUERY_LENGTH) : trimmed;
}

function parsePanelServerId(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 && trimmed.length <= MAX_PANEL_ID_LENGTH ? trimmed : null;
}

/** `URLSearchParams` ve `ReadonlyURLSearchParams` ortak yüzeyi. */
type ReadableParams = { get(name: string): string | null };

export function parseDiscoverRoute(params: ReadableParams): DiscoverRouteState {
  return {
    category: parseDiscoverCategory(params.get("cat")),
    lane: parseDiscoverLane(params.get("lane")),
    modal: params.get("modal") === "join" ? "join" : null,
    panelServerId: parsePanelServerId(params.get("panel")),
    q: parseDiscoverQuery(params.get("q")),
    sort: parseDiscoverSort(params.get("sort")),
  };
}

/**
 * Durumu adrese yazar. **Varsayılan değerler yazılmaz**: `/discover?lane=servers&cat=all`
 * ile `/discover` aynı ekranı gösterir ve iki farklı adres aynı şeyi anlatırsa paylaşılan
 * bağlantı hangisinin "doğru" olduğunu söyleyemez.
 *
 * `base` verildiğinde kısmi durum onun üzerine yamanır — bir sekmeye basmak kategoriyi
 * düşürmesin diye. Verilmezse varsayılan durumun üzerine yamanır.
 *
 * Anahtar sırası sabittir, çünkü aynı durumun her seferinde aynı dizeyi üretmesi geri tuşunu
 * öngörülebilir yapar.
 */
export function buildDiscoverHref(
  state: Partial<DiscoverRouteState> = {},
  base: DiscoverRouteState = DISCOVER_DEFAULT_ROUTE_STATE,
): string {
  const next: DiscoverRouteState = { ...base, ...state };
  const params = new URLSearchParams();

  if (next.lane !== DISCOVER_DEFAULT_LANE) {
    params.set("lane", next.lane);
  }

  if (next.category !== DISCOVER_DEFAULT_CATEGORY) {
    params.set("cat", next.category);
  }

  if (next.sort !== DISCOVER_DEFAULT_SORT) {
    params.set("sort", next.sort);
  }

  const query = parseDiscoverQuery(next.q);
  if (query.length > 0) {
    params.set("q", query);
  }

  const panelServerId = parsePanelServerId(next.panelServerId);
  if (panelServerId !== null) {
    params.set("panel", panelServerId);
  }

  if (next.modal !== null) {
    params.set("modal", next.modal);
  }

  const search = params.toString();
  return search.length > 0 ? `${DISCOVER_ROUTE}?${search}` : DISCOVER_ROUTE;
}

/**
 * SPEC §7: `Esc` **önce modalı**, sonra paneli kapatır. Kural tek yerde durur; iki bileşen
 * kendi `onKeyDown`'ında sıralamayı tekrar yazarsa bir gün ikisi aynı tuşta iki katman
 * kapatır.
 *
 * Kapatacak bir katman yoksa durum **aynı nesne** olarak döner; çağıran bunu "Esc'i olduğu
 * gibi bırak" olarak okuyabilir.
 */
export function closeTopDiscoverLayer(state: DiscoverRouteState): DiscoverRouteState {
  if (state.modal !== null) {
    return { ...state, modal: null };
  }

  if (state.panelServerId !== null) {
    return { ...state, panelServerId: null };
  }

  return state;
}

/**
 * SPEC §4.8 filtre şeridi "Tümünü temizle" ve §4.9 boş durumun "Filtreleri temizle" butonu
 * aynı sıfırlamayı yapar: kategori, sıralama ve arama gider — şerit, panel ve modal **kalır**.
 * Şeridi de sıfırlamak, Kanallar şeridinde arama yapan kullanıcıyı Sunucular'a atardı.
 */
export function clearDiscoverFilters(state: DiscoverRouteState): DiscoverRouteState {
  return {
    ...state,
    category: DISCOVER_DEFAULT_CATEGORY,
    q: "",
    sort: DISCOVER_DEFAULT_SORT,
  };
}

/** SPEC §4.8 — filtre şeridi yalnız bunlardan biri doğruyken çizilir. */
export function hasActiveDiscoverFilters(state: DiscoverRouteState): boolean {
  return (
    state.category !== DISCOVER_DEFAULT_CATEGORY ||
    state.sort !== DISCOVER_DEFAULT_SORT ||
    state.q.length > 0
  );
}
