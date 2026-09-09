import { SETTINGS_METRICS } from "@/lib/settings/metrics";

/**
 * Kullanıcı barı menüsünün (308 px popover) **yerleşim hesabı** — SPEC-AYARLAR §3.
 *
 * ## Neden ayrı bir modül
 *
 * Menü kullanıcı barının içinde `position:absolute` olarak duruyordu ve gezinme paneli sütunu
 * `overflow:hidden` taşıyor (`wizards-shell.tsx`, `width: var(--nav-panel-width)`). Panel
 * **280 px**, menü **308 px**: sütun menünün sağ kenarını kırpıyordu ve kırpılan kutu üçüncü
 * sütunun altında kalıyormuş gibi görünüyordu. `overflow` kırpması `z-index` ile aşılamaz —
 * yığın sırası bir kırpma kutusunu delmez.
 *
 * Çözüm menüyü `document.body`'ye portallamak ve `position:fixed` ile konumlamak. O zaman da
 * koordinat bir **hesap** oluyor ve hesap ekransız test edilebilmeli: bu dosya saf, girdisi bir
 * dikdörtgen ve bir görünüm alanı.
 *
 * ## Birim sözleşmesi — hepsi **fiziksel** piksel
 *
 * `getBoundingClientRect()` ve `innerWidth/innerHeight` fiziksel pikseldir; ölçek adımından
 * (SPEC-ANA-SAYFA §8: kök font boyutu 16/18/24/32) etkilenmezler. Tasarım ölçüleri (308 · 14 · 9)
 * ise **tasarım** pikselidir ve rem gibi ölçekle büyümelidir. İkisini karıştırmak ×1'de doğru,
 * ×1.5'te bir buçuk kat kayan bir menü demekti; bu yüzden tasarım ölçüleri girişte kök font
 * boyutuyla çarpılıp fiziksel piksele çevriliyor ve hesap tek birimde yapılıyor. Çıktı da
 * fiziksel piksel: tüketici `rem`'e **çevirmez**, `px` yazar.
 *
 * SPEC kutuyu kabuğun `left: 82px · bottom: 14px` koordinatına koyuyor. Bu koordinat masaüstü
 * kabuğunda çapanın kendisinden **türüyor** (ray 74 + ayak dolgusu 10 = 84 ≈ 82), ama menü üç
 * ayrı yüzeyde açılıyor (gezinme paneli · kanal kenarı · mobil çekmece) ve üçünde de çapa farklı
 * yerde. Bu yüzden sabit koordinat değil **çapa** okunuyor; SPEC'in sayısı görünüm alanı
 * kenarından korunacak boşluk olarak yaşıyor.
 */

const { userMenu } = SETTINGS_METRICS;

/** Ölçek motorunun taban kök font boyutu (`lib/home/scale.ts` ×1 adımı). */
const BASE_ROOT_FONT_SIZE = 16;

/** Menü ile kullanıcı barı arasındaki boşluk (tasarımdaki `0.55rem` ≈ 9 tasarım px). */
export const USER_BAR_MENU_ANCHOR_GAP = 9;

/** Görünüm alanı kenarından korunan boşluk — SPEC §3'ün `bottom: 14`'ü. */
export const USER_BAR_MENU_EDGE_PADDING = userMenu.bottom;

/**
 * Menünün istediği en fazla yükseklik (eski sınıfın `34rem`'i), tasarım pikselinde.
 *
 * Bir tavan, bir hedef değil: cihaz listeleri açıldığında menü uzar, uzadığında da ekranda
 * kalması için `resolveUserBarMenuPlacement` bunu kalan boşlukla kesişir.
 */
export const USER_BAR_MENU_MAX_HEIGHT = 544;

export type UserBarMenuAnchor = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
};

export type UserBarMenuViewport = {
  readonly height: number;
  readonly width: number;
};

/** Hepsi **fiziksel** piksel; tüketici doğrudan `px` olarak yazar. */
export type UserBarMenuPlacement = {
  /** `position: fixed` kutusunun alt kenarı, görünüm alanı altından. */
  readonly bottom: number;
  readonly left: number;
  /** Menü bu yüksekliği aşarsa kendi içinde kaydırır; asla ekranın dışına taşmaz. */
  readonly maxHeight: number;
  readonly width: number;
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

/**
 * Çapanın **üstüne** oturan menünün sabit koordinatları.
 *
 * Üç kural:
 *
 * 1. Sol kenar çapayı izler ama görünüm alanına kıstırılır — dar ekranda menü sağdan taşmaz.
 * 2. Alt kenar çapanın üst kenarından `gap` kadar yukarıdadır; menü kullanıcı barını **örtmez**,
 *    çünkü örttüğü an kullanıcı hangi düğmeye bastığını göremez.
 * 3. Yükseklik kalan boşluğa kısılır. Kısılmayan bir menü uzun cihaz listesinde ekranın üstünden
 *    taşar ve ilk bölüm (`Durum`) erişilemez olur.
 *
 * Ölçülemeyen görünüm alanı (SSR, sıfır, `NaN`) SPEC'in sabit koordinatına düşer.
 */
export function resolveUserBarMenuPlacement(input: {
  readonly anchor: UserBarMenuAnchor | null;
  /** Tasarım pikselinde; ölçek adımıyla birlikte fiziksel piksele çevrilir. */
  readonly maxHeight?: number;
  /** `document.documentElement` kök font boyutu — ölçek adımının fiziksel karşılığı. */
  readonly rootFontSizePx?: number;
  readonly viewport: UserBarMenuViewport;
}): UserBarMenuPlacement {
  const { anchor, viewport } = input;
  const rootFontSize =
    Number.isFinite(input.rootFontSizePx) && (input.rootFontSizePx ?? 0) > 0
      ? (input.rootFontSizePx as number)
      : BASE_ROOT_FONT_SIZE;

  /** Tasarım pikseli → fiziksel piksel. `rem`'in yaptığı çarpımın aynısı. */
  const scale = (designPx: number) => (designPx / BASE_ROOT_FONT_SIZE) * rootFontSize;

  const edge = scale(USER_BAR_MENU_EDGE_PADDING);
  const gap = scale(USER_BAR_MENU_ANCHOR_GAP);
  const desiredWidth = scale(userMenu.width);
  const desiredMaxHeight = scale(input.maxHeight ?? USER_BAR_MENU_MAX_HEIGHT);

  const measurable =
    Number.isFinite(viewport.width) &&
    Number.isFinite(viewport.height) &&
    viewport.width > 0 &&
    viewport.height > 0;

  if (!measurable || !anchor) {
    return {
      bottom: edge,
      left: scale(userMenu.left),
      maxHeight: desiredMaxHeight,
      width: desiredWidth,
    };
  }

  const anchorWidth =
    Number.isFinite(anchor.width) && anchor.width > 0 ? anchor.width : desiredWidth;
  const width = Math.min(anchorWidth, Math.max(0, viewport.width - edge * 2));
  const left = clamp(anchor.left, edge, viewport.width - width - edge);
  const bottom = clamp(
    viewport.height - anchor.top + gap,
    edge,
    Math.max(edge, viewport.height - edge),
  );
  const available = Math.max(0, viewport.height - bottom - edge);

  return { bottom, left, maxHeight: Math.min(desiredMaxHeight, available), width };
}
