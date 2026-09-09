/**
 * "Sorun bildir" penceresinin ve ray alt bloğunun ölçü sözlüğü.
 *
 * Kaynak sırası:
 *   1. `design_handoff/app_new/indirme-sorunbildir-paketi/kaynak/Indirme ve Sorun Bildir.dc.html`
 *      — inline `style` değerleri (**nihai otorite**)
 *   2. `design_handoff/app_new/indirme-sorunbildir-paketi/SPEC.md` §0, §A
 *   3. `design_handoff/app_new/indirme-sorunbildir-paketi/ekranlar/01..13*.png`
 *
 * Değerler ×1 ölçekteki **tasarım pikselidir**; tüketiciler `pxToRem` ile rem'e çevirir.
 * Sözlük **renk taşımaz** — yalnız ölçü, yarıçap, boşluk, ağırlık, satır yüksekliği ve süre.
 * Kayıtlardaki `alpha` bir opaklıktır, renk değil; tonu tüketici `hsl(var(--token)/alpha)`
 * ile verir.
 */

import { hairline, pxToEm, pxToRem } from "@/lib/home/metrics";

export { hairline, pxToEm, pxToRem };

/** SPEC §A.4 — açıklama alanının sınırları ve sayaç eşikleri. */
export const REPORT_BODY_MIN_LENGTH = 20;
export const REPORT_BODY_MAX_LENGTH = 1_000;
/** Bu değerin **üstünde** sayaç `warning`, tam sınırda `danger` olur. */
export const REPORT_COUNTER_WARNING_THRESHOLD = 900;
/** SPEC §A.5 — "Son 500 satır · mesaj içeriği yok". */
export const REPORT_LOG_LINE_COUNT = 500;

export const REPORT_METRICS = {
  /** SPEC §0 — rayın dibindeki iki düğme. */
  rail: {
    buttonSize: 41,
    buttonRadius: 14,
    downloadBorderWidth: 1.5,
    downloadBorderAlpha: 0.4,
    downloadSurfaceAlpha: 0.2,
    downloadHoverSurfaceAlpha: 0.3,
    downloadIconSize: 17,
    downloadIconStroke: 2.2,
    reportBorderWidth: 1,
    reportBorderAlpha: 0.8,
    reportHoverBorderAlpha: 0.4,
    reportHoverSurfaceAlpha: 0.18,
    reportIconSize: 18,
    reportIconStroke: 1.7,
    dividerWidth: 22,
    dividerMarginY: 9,
    dividerAlpha: 0.9,
    /** Her iki düğme de hover'da bu kadar yukarı kalkar. */
    hoverLift: 2,
  },

  /** SPEC §A.1 — kabuk. */
  shell: {
    backdropPadding: 34,
    backdropAlpha: 0.72,
    width: 520,
    radius: 22,
    /** `0 48px 96px -40px hsl(var(--shadow-color))` */
    shadow: { blur: 96, spread: -40, y: 48 },
  },

  /** SPEC §A.2 — başlık şeridi. */
  header: {
    paddingTop: 20,
    paddingX: 22,
    paddingBottom: 15,
    gap: 12,
    dividerAlpha: 0.5,
    iconBox: 38,
    iconRadius: 13,
    iconSize: 19,
    iconStroke: 1.9,
    iconSurfaceAlpha: 0.16,
    titleFontSize: 19,
    titleLineHeight: 1.2,
    subtitleMarginTop: 5,
    subtitleFontSize: 13,
    subtitleLineHeight: 1.5,
    closeSize: 30,
    closeRadius: 10,
    closeIconSize: 15,
    closeIconStroke: 2,
  },

  body: {
    paddingTop: 17,
    paddingX: 22,
    paddingBottom: 20,
    /** Gönderim sürerken gövde salt okunur olur (SPEC §A.8). */
    busyOpacity: 0.55,
  },

  /** SPEC §A.3 — grup etiketi ve "Zorunlu" pili. */
  groupLabel: {
    fontSize: 10,
    letterSpacing: 0.15,
    gap: 9,
    /** İki grup etiketinin arasındaki dikey boşluk. */
    sectionMarginTop: 19,
    pillPaddingY: 2,
    pillPaddingX: 7,
    pillRadius: 6,
    pillFontSize: 9.5,
    pillSurfaceAlpha: 0.14,
  },

  /** SPEC §A.3 — kategori çipleri. */
  chip: {
    marginTop: 10,
    gap: 7,
    height: 34,
    paddingX: 12,
    radius: 11,
    fontSize: 12.5,
    iconSize: 15,
    iconGap: 7,
    strokeIdle: 1.9,
    strokeSelected: 2.1,
    borderIdleAlpha: 0.7,
    borderHoverAlpha: 0.55,
    focusRingWidth: 2,
    focusRingAlpha: 0.45,
  },

  /** SPEC §A.4 — açıklama alanı. */
  description: {
    marginTop: 9,
    radius: 14,
    borderFocusAlpha: 0.45,
    rows: 4,
    paddingY: 12,
    paddingX: 14,
    fontSize: 13.5,
    lineHeight: 1.55,
    /** Bu satır sayısından sonra alan büyümez, içi kaydırılır. */
    maxRows: 10,
    footerPaddingY: 8,
    footerPaddingX: 13,
    footerGap: 10,
    footerDividerAlpha: 0.55,
    footerSurfaceAlpha: 0.5,
    hintFontSize: 11.5,
    hintLineHeight: 1.4,
    counterFontSize: 11,
  },

  /** SPEC §A.5 — "Rapora eklenecekler" kartı. */
  attachments: {
    marginTop: 9,
    radius: 16,
    borderAlpha: 0.7,
    rowPaddingY: 12,
    rowPaddingX: 13,
    rowGap: 11,
    dividerAlpha: 0.55,
    titleFontSize: 13,
    titleLineHeight: 1.2,
    subtitleMarginTop: 4,
    subtitleFontSize: 11.5,
    subtitleLineHeight: 1.45,
  },

  toggle: {
    width: 40,
    height: 22,
    knobSize: 16,
    knobTop: 3,
    knobLeftOff: 3,
    knobLeftOn: 21,
  },

  /** SPEC §A.5 alt bölüm — ekran görüntüsü satırı. */
  screenshot: {
    boxWidth: 34,
    boxHeight: 44,
    boxRadius: 9,
    boxBorderFailAlpha: 0.5,
    boxBorderBusyAlpha: 0.5,
    boxSurfaceFailAlpha: 0.08,
    emptyIconSize: 14,
    emptyIconStroke: 2,
    stripeStep: 6,
    stripePeriod: 12,
    zoomBadge: 16,
    zoomIconSize: 10,
    zoomIconStroke: 2.4,
    zoomBadgeAlpha: 0.9,
    busyFontSize: 10,
    failIconSize: 15,
    failIconStroke: 2,
    actionGap: 8,
    actionFontSize: 11.5,
    actionUnderlineOffset: 3,
    progressMarginTop: 7,
    progressHeight: 4,
  },

  /** SPEC §A.6 — gizlilik notu. */
  privacy: {
    marginTop: 14,
    paddingY: 11,
    paddingX: 13,
    radius: 13,
    gap: 10,
    surfaceAlpha: 0.7,
    iconSize: 16,
    iconStroke: 1.9,
    iconMarginTop: 1,
    fontSize: 11.5,
    lineHeight: 1.5,
  },

  /** SPEC §A.7 — hata ve çevrimdışı satırları. */
  notice: {
    marginTop: 10,
    paddingY: 11,
    paddingX: 13,
    radius: 13,
    gap: 10,
    iconSize: 16,
    iconStroke: 1.9,
    iconMarginTop: 1,
    fontSize: 12,
    lineHeight: 1.5,
    dangerSurfaceAlpha: 0.1,
    dangerBorderAlpha: 0.35,
    warningSurfaceAlpha: 0.12,
    warningBorderAlpha: 0.35,
    retryHeight: 26,
    retryPaddingX: 10,
    retryRadius: 8,
    retryFontSize: 11.5,
    retryBorderAlpha: 0.4,
  },

  /** SPEC §A.8 — alt bar. */
  footer: {
    paddingY: 14,
    paddingX: 22,
    gap: 9,
    dividerAlpha: 0.5,
    surfaceAlpha: 0.5,
    noteFontSize: 12,
    noteLineHeight: 1.4,
    noteMinWidth: 150,
    buttonHeight: 40,
    buttonRadius: 13,
    buttonFontSize: 13,
    buttonGap: 8,
    secondaryPaddingX: 16,
    primaryPaddingX: 18,
    spinnerSize: 14,
    spinnerBorderWidth: 2,
    /** `0 12px 26px -16px hsl(var(--primary))` */
    shadow: { blur: 26, spread: -16, y: 12 },
  },

  /** SPEC §A.9 — vazgeçme onayı. */
  discard: {
    backdropPadding: 34,
    backdropAlpha: 0.66,
    width: 392,
    radius: 20,
    paddingTop: 20,
    paddingX: 22,
    paddingBottom: 18,
    /** `0 44px 90px -38px hsl(var(--shadow-color))` */
    shadow: { blur: 90, spread: -38, y: 44 },
    headerGap: 11,
    iconBox: 34,
    iconRadius: 12,
    iconSize: 17,
    iconStroke: 1.9,
    iconSurfaceAlpha: 0.14,
    titleFontSize: 16,
    titleLineHeight: 1.25,
    bodyMarginTop: 6,
    bodyFontSize: 12.5,
    bodyLineHeight: 1.55,
    actionsMarginTop: 18,
    actionsGap: 9,
    buttonHeight: 38,
    buttonRadius: 12,
    buttonFontSize: 12.5,
    discardPaddingX: 15,
    discardBorderAlpha: 0.4,
    discardHoverSurfaceAlpha: 0.1,
    keepPaddingX: 17,
  },

  /** SPEC §A.10 — tam ekran görsel. */
  lightbox: {
    backdropPadding: 44,
    backdropAlpha: 0.9,
    gap: 14,
    frameWidth: 620,
    frameRadius: 18,
    stripeStep: 18,
    stripePeriod: 36,
    stripeAlpha: 0.75,
    iconSize: 30,
    iconStroke: 1.7,
    captionGap: 9,
    captionFontSize: 12,
    closeInset: 11,
    closeSize: 32,
    closeRadius: 11,
    closeIconSize: 16,
    closeSurfaceAlpha: 0.92,
    removeHeight: 40,
    removePaddingX: 18,
    removeRadius: 13,
    removeFontSize: 13,
    removeIconSize: 15,
    removeGap: 8,
    removeSurfaceAlpha: 0.1,
    removeBorderAlpha: 0.42,
    removeHoverSurfaceAlpha: 0.18,
  },

  /** SPEC §A.11 — başarı ekranı. */
  success: {
    paddingTop: 30,
    paddingX: 26,
    paddingBottom: 26,
    gap: 13,
    circleSize: 52,
    circleSurfaceAlpha: 0.16,
    iconSize: 26,
    iconStroke: 2.4,
    titleFontSize: 19,
    titleLineHeight: 1.2,
    bodyMarginTop: 7,
    bodyFontSize: 13,
    bodyLineHeight: 1.55,
    bodyMaxWidth: 340,
    ticketMarginTop: 2,
    ticketPaddingY: 9,
    ticketPaddingLeft: 14,
    ticketPaddingRight: 10,
    ticketRadius: 14,
    ticketGap: 9,
    ticketBorderAlpha: 0.7,
    ticketFontSize: 15,
    ticketLetterSpacing: 0.04,
    copyHeight: 32,
    copyPaddingX: 12,
    copyRadius: 10,
    copyFontSize: 12,
    copyIconSize: 13,
    copyGap: 6,
    copiedBorderAlpha: 0.45,
    copiedSurfaceAlpha: 0.14,
    closeMarginTop: 6,
    closeHeight: 40,
    closePaddingX: 20,
    closeRadius: 13,
    closeFontSize: 13,
  },

  /** SPEC §C — tasarımda yalnız bu iki süre var. */
  motion: {
    transitionSeconds: 0.16,
    spinnerSeconds: 0.7,
  },
} as const;
