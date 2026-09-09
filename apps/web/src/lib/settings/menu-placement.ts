/**
 * Açılır menünün yönü ve yüksekliği — SPEC-AYARLAR §4.4, tuzak #6.
 *
 * Yön **tıklama anında ölçülür**, render sırasında tahmin edilmez: satırın kaydırma alanı
 * içindeki yeri her kaydırmada değişir, bu yüzden render zamanı bilinen tek şey "menü bir yere
 * açılacak"tır. Referans (`Ayarlar-referans.dc.html`, `type === 'sel'`) aynı kararı
 * `r.bottom + 236 > limit` ile veriyor; burada eşik ölçü sözlüğünden okunur ve `limit`
 * hesabı `measureScrollArea` içinde ayrı durur — ölçüm ile karar birbirinden ayrı test edilsin.
 *
 * Grup kabında `overflow:hidden` **yasak** olduğu için menü kabı kırpmıyor; kırpabilen tek şey
 * kaydırma alanının kendisi. Bu yüzden `maxHeight` seçilen yöndeki gerçek boşluğa kısılır:
 * menünün ilk ve son seçeneği her durumda kaydırma alanının içinde kalır.
 */

import { SETTINGS_METRICS } from "@/lib/settings/metrics";

export type SettingsMenuDirection = "down" | "up";

export type SettingsMenuPlacementInput = {
  /** Tetikleyicinin alt kenarı (görünüm alanı koordinatı, `getBoundingClientRect().bottom`). */
  triggerBottom: number;
  /** Tetikleyicinin üst kenarı. */
  triggerTop: number;
  /** Kaydırma alanının alt kenarı. */
  scrollAreaBottom: number;
  /** Kaydırma alanının üst kenarı. */
  scrollAreaTop: number;
  /** Menünün istediği yükseklik; her hâlde `menuMaxHeight` (222) ile sınırlanır. */
  menuHeight: number;
  /** Aşağı açılmak için gereken en az boşluk. Varsayılan 236 (ölçü sözlüğü). */
  threshold?: number;
};

export type SettingsMenuPlacement = {
  direction: SettingsMenuDirection;
  maxHeight: number;
};

const { menuMaxHeight, openDownThreshold } = SETTINGS_METRICS.controls.select;

/** SPEC §4.4 — menü en çok bu kadar uzar; kalanı kendi içinde kaydırılır. */
export const SETTINGS_MENU_MAX_HEIGHT = menuMaxHeight;

/** SPEC §4.4 — aşağı açılmak için gereken boşluk. */
export const SETTINGS_MENU_OPEN_DOWN_THRESHOLD = openDownThreshold;

/**
 * Yönü ve yüksekliği verir.
 *
 * Eşik sınavını **aşağı** kazanır: `236` px boşluk varken menü aşağı açılır, `235` px'te yukarı.
 * İki yönün de eşiği geçmediği durumda referansın kuralı ("yer yoksa yukarı") menüyü daha küçük
 * boşluğa da atabiliyordu; burada o hâlde **daha geniş** olan yön seçilir. Kural sertleşiyor,
 * gevşemiyor: eşik geçildiği anda davranış referansla birebir aynı, yalnız iki yönün de dar
 * olduğu uç durumda kırpılma daha az.
 */
export function resolveMenuPlacement(input: SettingsMenuPlacementInput): SettingsMenuPlacement {
  const threshold = input.threshold ?? SETTINGS_MENU_OPEN_DOWN_THRESHOLD;
  const requested = Math.min(Math.max(input.menuHeight, 0), SETTINGS_MENU_MAX_HEIGHT);

  const downRoom = Math.max(input.scrollAreaBottom - input.triggerBottom, 0);
  const upRoom = Math.max(input.triggerTop - input.scrollAreaTop, 0);

  const direction: SettingsMenuDirection =
    downRoom >= threshold ? "down" : upRoom > downRoom ? "up" : "down";

  return {
    direction,
    maxHeight: Math.min(requested, direction === "down" ? downRoom : upRoom),
  };
}

export type SettingsScrollAreaBounds = { bottom: number; top: number };

/**
 * Kırpma yapan `overflow-y` değerleri.
 *
 * Yalnız `auto` aranıyordu; `scroll` ile kurulmuş bir kap (kaydırma çubuğunu her zaman
 * göstermek isteyen düzenlerin varsayılanı) ve tarayıcıya özgü `overlay` sınır sayılmıyordu.
 * Böyle bir kabın içinde menü, kabın kendisi kırpıyorken görünüm alanına göre ölçülüyor ve
 * yanlış yöne açılıyordu. `hidden` bilerek listede yok: kırpıyor ama kaydırmıyor, yani
 * `scrollHeight` farkı da olmadığı için zaten aşağıdaki eşiği geçmez.
 */
const CLIPPING_OVERFLOW_VALUES = new Set(["auto", "scroll", "overlay"]);

/**
 * Bir kabın "gerçekten kaydırıyor" sayılması için gereken en az taşma.
 *
 * Sıfır yerine küçük bir pay: alt piksel yuvarlamaları `scrollHeight`i `clientHeight`ten 1–2 px
 * büyük gösterebiliyor ve kaydırmayan her kap sınır sayılırsa menü boşu boşuna yukarı açılır.
 */
const SCROLLABLE_OVERFLOW_TOLERANCE_PX = 4;

/**
 * Tetikleyiciyi kırpabilecek en yakın kaydırma alanını bulur.
 *
 * Kırpan `overflow-y` **ve** gerçekten kaydırılabilir olan ilk ata. `overflow-y` kontrolü tek
 * başına yetmez — kaydırmayan bir `auto` kap menüyü kırpmaz ve onu sınır saymak menüyü boşu
 * boşuna yukarı açardı. Hiçbir ata bulunamazsa sınır görünüm alanıdır.
 */
export function measureScrollArea(
  element: Element | null,
  viewportHeight: number,
): SettingsScrollAreaBounds {
  let node = element?.parentElement ?? null;

  while (node) {
    const scrollable = node.scrollHeight - node.clientHeight > SCROLLABLE_OVERFLOW_TOLERANCE_PX;

    if (scrollable && CLIPPING_OVERFLOW_VALUES.has(readOverflowY(node))) {
      const rect = node.getBoundingClientRect();

      return { bottom: rect.bottom, top: rect.top };
    }

    node = node.parentElement;
  }

  return { bottom: viewportHeight, top: 0 };
}

function readOverflowY(node: Element): string {
  const view = node.ownerDocument?.defaultView;

  return view ? view.getComputedStyle(node).overflowY : "visible";
}
