import type {
  AppNotificationGroup,
  NotifKind,
  NotifPanelTab,
  NotifUnreadCounts,
} from "@wizards/types";

import type { NotificationPageDTO } from "./types";

/**
 * Bildirimler paneli + 560 px bildirim ayarları penceresi — Dalga 4 / Ş11'in **tek**
 * indirgeyicisi ve saf seçicileri.
 *
 * Merdiven burada tanımlanır, çağrı yerlerinde tekrarlanmaz (00 tuzak #12): aynı anda tek
 * panel, tek modal. Zil, dişli, örtü ve `Esc` dördü de aynı geçişleri çağırır; her biri kendi
 * `useState` üçlüsünü tutsaydı "dişli paneli kapatır" kuralı dört yerde yazılır ve birinde
 * unutulurdu.
 *
 * Bu depoda web testlerinin DOM'u yok (`node:test` + `renderToStaticMarkup`), o yüzden
 * etkileşimin **kararı** buraya, çizimi bileşenlere ayrıldı: sekme seçimi, okundu çevirme,
 * sayaç birleştirme ve `Esc` basamağı burada testlenir.
 *
 * Modül saf: React, `fetch`, sözlük ve sistem saati görmez.
 */

/** SPEC §1 — dört sekme, soldan sağa. `←/→` gezinmesi bu sırayı okur. */
export const NOTIF_PANEL_TABS = [
  "all",
  "mentions",
  "replies",
  "system",
] as const satisfies readonly NotifPanelTab[];

/**
 * SPEC §1 — 32 px tür ikonunun harfi.
 *
 * Referans **beş** ikon çiziyor: bahsetme `@`, rol `R`, thread `T`, etkinlik `E`, sistem `S`.
 * Ürünün sözleşmesinde (`NotifKind`, Ş0) dört değer var ve rol bahsetmesi ile kişisel bahsetme
 * aynı `mention` kovasına düşüyor (`panel-query.ts`). Beşinci ikonu çizebilmek için sunucunun
 * satır başına "bu bir rol bahsetmesiydi" demesi gerekirdi; o alan bu şeridin değil Ş2'nin
 * dosyasında ve uydurulmuş bir istemci sezgisi (başlıkta `@rol` aramak gibi) rol adını
 * içeren her bahsetmeyi yanlış boyardı. Dört kova, dört harf; sapma raporda.
 */
export const NOTIF_KIND_GLYPH: Readonly<Record<NotifKind, string>> = {
  event: "E",
  mention: "@",
  reply: "T",
  system: "S",
};

/** Ton **token adıdır**, renk değil (kalite çıtası). `--info` `app/globals.css:37`'de hazır. */
export const NOTIF_KIND_TONE: Readonly<Record<NotifKind, string>> = {
  event: "--warning",
  mention: "--primary",
  reply: "--success",
  system: "--text-muted",
};

export const EMPTY_NOTIF_COUNTS: NotifUnreadCounts = {
  all: 0,
  mentions: 0,
  replies: 0,
  system: 0,
};

export type NotifPanelSurface = "closed" | "panel" | "prefs";

/**
 * `idle` ilk boyadır: pencere açılır açılmaz `Kaydedildi` yazmak, kullanıcının henüz yapmadığı
 * bir şeyi onaylamaktır. `saving → saved` geçişi **gerçek yanıt** üzerine kurulur; referanstaki
 * 850 ms sabit gecikme taklit edilmez (00 tuzak #14).
 */
export type NotifPanelSaveState = "error" | "idle" | "saved" | "saving";

export type NotifPanelState = {
  readonly save: NotifPanelSaveState;
  readonly surface: NotifPanelSurface;
  readonly tab: NotifPanelTab;
};

export type NotifPanelAction =
  | { readonly save: NotifPanelSaveState; readonly type: "save" }
  | { readonly tab: NotifPanelTab; readonly type: "selectTab" }
  | { readonly type: "closeAll" }
  | { readonly type: "escape" }
  | { readonly type: "openPanel" }
  | { readonly type: "openPrefs" }
  | { readonly type: "togglePanel" };

/** `Esc`'in kapatacağı basamak — önce modal, sonra panel (SPEC §0, prompt §B.7). */
export type NotifPanelEscapeTarget = "none" | "panel" | "prefs";

export function createNotifPanelState(): NotifPanelState {
  return { save: "idle", surface: "closed", tab: "all" };
}

export function resolveNotifPanelEscape(state: NotifPanelState): NotifPanelEscapeTarget {
  if (state.surface === "prefs") return "prefs";
  if (state.surface === "panel") return "panel";

  return "none";
}

export function notifPanelReducer(
  state: NotifPanelState,
  action: NotifPanelAction,
): NotifPanelState {
  switch (action.type) {
    case "togglePanel": {
      // Modal açıkken zile basmak paneli açmaz, açık modalı kapatır: aksi hâlde ikisi birden
      // açık kalır ve "aynı anda tek panel, tek modal" ilk tıklamada bozulurdu.
      return state.surface === "closed"
        ? { ...state, save: "idle", surface: "panel" }
        : { ...state, save: "idle", surface: "closed" };
    }

    case "openPanel": {
      return state.surface === "panel" ? state : { ...state, save: "idle", surface: "panel" };
    }

    /**
     * SPEC §2 — dişli paneli **kapatır** ve pencereyi açar. İki geçiş değil bir geçiş: ikisi
     * ayrı yazıldığında araya giren bir render panelin ve modalın birlikte göründüğü tek bir
     * kareyi ekrana getirir.
     */
    case "openPrefs": {
      return state.surface === "prefs" ? state : { ...state, save: "idle", surface: "prefs" };
    }

    case "closeAll": {
      return state.surface === "closed" ? state : { ...state, save: "idle", surface: "closed" };
    }

    /**
     * Merdivenin bir basamağı. Bugün panel ve modal aynı anda açık olamadığı için tek `Esc`
     * ikisini de kapatır; basamak yine de adlandırılır, çünkü çağıran hangi katmanın olayı
     * yuttuğunu bilmeden `Esc`'i dışarı sızdırır ve arkadaki Ayarlar penceresi de kapanır.
     */
    case "escape": {
      return state.surface === "closed" ? state : { ...state, save: "idle", surface: "closed" };
    }

    case "selectTab": {
      return state.tab === action.tab ? state : { ...state, tab: action.tab };
    }

    case "save": {
      return state.save === action.save ? state : { ...state, save: action.save };
    }
  }
}

/** `←/→` sekme gezinmesi; uçlarda sarar. */
export function nextNotifPanelTab(tab: NotifPanelTab, direction: -1 | 1): NotifPanelTab {
  const index = NOTIF_PANEL_TABS.indexOf(tab);
  const length = NOTIF_PANEL_TABS.length;

  return NOTIF_PANEL_TABS[(index + direction + length) % length] as NotifPanelTab;
}

export function selectNotifTabCount(counts: NotifUnreadCounts, tab: NotifPanelTab): number {
  return counts[tab];
}

/**
 * Kabul kriteri: kırmızı `0` pili **hiçbir durumda** görünmez.
 *
 * Tek yerde sorulur; her çizim yerinde `count > 0` yazılsaydı biri unutulur ve "0 okunmamış
 * bildirimin var" diyen bir rozet çıkardı. Negatif değer de gizlenir: sunucudan gelmemeli ama
 * gelirse `-1` yazan bir pil, boş bir pilden daha kötüdür.
 */
export function hasVisibleNotifCount(count: number): boolean {
  return count > 0;
}

/**
 * Sayaç **her zaman** sunucudan gelir; istemci artırmaz (prompt §3, Ş2 §6).
 *
 * İki sekme açıkken artırma kaçınılmaz olarak ayrışır: birinde okunan bildirim diğerinin yerel
 * sayacını düşürmez. `notification:new` yükü sayacı taşımıyorsa (18 yayımcının bir kısmı henüz
 * `withNotificationCounts` kullanmıyor) eldeki sayaç **korunur** ve çağıran `/unread-count`
 * okur — yanlış bir sayı göstermektense bir tur eski sayı göstermek yeğdir.
 */
export function mergeNotifCounts(
  current: NotifUnreadCounts,
  incoming: NotifUnreadCounts | undefined,
): NotifUnreadCounts {
  return incoming ?? current;
}

/** Sayfaların sayacı **son** yanıtındır: en yeni sunucu gerçeği o. */
export function selectNotifCountsFromPages(
  pages: readonly NotificationPageDTO[] | undefined,
): NotifUnreadCounts {
  const last = pages?.[pages.length - 1];

  return last?.counts ?? EMPTY_NOTIF_COUNTS;
}

/**
 * Bir satırın okundu durumunu sayfalarda çevirir.
 *
 * Yalnız **görünen bayrağı** değiştirir; sayaçlara dokunmaz. Sayaç sunucunun yanıtından gelir
 * ve burada tahmin edilseydi, aynı bildirimi iki sekmede açık tutan kullanıcı iki farklı sayı
 * görürdü.
 */
export function applyNotifReadFlag(
  groups: readonly AppNotificationGroup[],
  id: string,
  read: boolean,
): AppNotificationGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => (item.id === id ? { ...item, read } : item)),
  }));
}

/** `Tümünü okundu işaretle` — sayfadaki her satır okunmuş sayılır. */
export function applyNotifReadAll(groups: readonly AppNotificationGroup[]): AppNotificationGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => (item.read ? item : { ...item, read: true })),
  }));
}

/**
 * Boş durum, "hiç grup yok" değil "hiç satır yok" demektir: sunucu boş bir grup döndürmez ama
 * bir gün döndürürse, boş bir gün başlığının altında hiçbir şey olmayan bir panel çizilirdi.
 */
export function isNotifListEmpty(groups: readonly AppNotificationGroup[]): boolean {
  return groups.every((group) => group.items.length === 0);
}

export function flattenNotifPages(
  pages: readonly NotificationPageDTO[] | undefined,
): AppNotificationGroup[] {
  const merged = new Map<AppNotificationGroup["label"], AppNotificationGroup["items"][number][]>();

  for (const page of pages ?? []) {
    for (const group of page.groups) {
      const existing = merged.get(group.label);

      if (existing) {
        existing.push(...group.items);
      } else {
        merged.set(group.label, [...group.items]);
      }
    }
  }

  // Kova sırası sunucunun sırasıdır (`BUCKET_ORDER`); `Map` ekleme sırasını koruduğu için ilk
  // sayfanın sırası korunur ve sonraki sayfalar kendi kovalarının **altına** eklenir.
  return [...merged].map(([label, items]) => ({ items, label }));
}
