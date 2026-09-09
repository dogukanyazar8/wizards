/**
 * "Bahsedilmeler" ekranının ölçü sözlüğü.
 *
 * Kaynak sırası:
 *   1. `design_handoff/app_new/bahsedilmeler-paketi/referans/Bahsedilmeler.dc.html` — inline `style`
 *      değerleri (**nihai otorite**)
 *   2. `design_handoff/app_new/bahsedilmeler-paketi/referans/Bahsedilmeler-referans.html` — çalışan kopya
 *   3. `design_handoff/app_new/bahsedilmeler-paketi/SPEC-BAHSEDILMELER.md` §1–§8
 *
 * Değerler ×1 ölçekteki **tasarım pikselidir**; tüketiciler `pxToRem` ile rem'e çevirir. Kabuk
 * yükselirken (SPEC-ANA-SAYFA §8.1) kök font boyutu değişir, sözlük değişmez.
 *
 * Sözlük **renk taşımaz** — yalnız ölçü, yarıçap, boşluk, ağırlık, satır yüksekliği ve süre.
 * Gölge kayıtlarındaki `alpha` bir opaklıktır, renk değil; tonu tüketici `hsl(var(--token)/alpha)`
 * ile verir.
 */

import { hairline, pxToEm, pxToRem } from "@/lib/home/metrics";

export { hairline, pxToEm, pxToRem };

/**
 * `Bahsedilmeler.dc.html` ile `SPEC-BAHSEDILMELER.md` arasındaki **sayısal** çelişkiler. Sözlük
 * her satırda `html` değerini kullanır.
 *
 * Bu liste bir kanıt kaydıdır: uygulayan şerit "SPEC 22 diyor, kod 20 yazmış" sorusuyla
 * karşılaştığında cevabı burada bulur.
 *
 * Mesajlar paketinin aksine bu ekranda **sayısal çelişki neredeyse yok** — SPEC doğrudan
 * HTML'den çıkarılmış. Aşağıdaki üç kayıt gerçek farklardır; SPEC'in sessiz kaldığı yerler
 * çelişki değildir ve listeye girmez (onlar sözlükte `// SPEC sessiz` ile işaretlidir).
 */
export const SPEC_DEVIATIONS = [
  /** SPEC §3 tür satırı pilinin yazı tipini vermiyor; HTML 11px display veriyor. */
  { field: "sidebar.kindRowPillFontSize", html: 11, spec: null },
  /** SPEC §5 tür pilinde letter-spacing yok; HTML `.02em` uyguluyor. */
  { field: "card.kindBadgeLetterSpacing", html: 0.02, spec: null },
  /**
   * SPEC §8 boş durumdaki iki butonu yalnız `height 38, radius 12` diye veriyor; HTML yatay
   * padding'i de sabitliyor (ikisi de 17), o yüzden sözlük HTML'i alır.
   */
  { field: "emptyState.buttonPaddingX", html: 17, spec: null },
] as const;

/**
 * Yoğunluk değişkenleri (SPEC §1). Tasarımın "Tweaks" panelinden gelir; üründe
 * `InterfaceDensity` tercihine bağlanır. Referans artboard bu iki değişkeni tanımlar ama
 * çizimde kullanmaz — ürün tarafında kart iç boşluğunu ve kart arası boşluğu sürecek olan
 * sözleşme budur.
 */
export const MENTIONS_DENSITY = {
  compact: { pad: 5, gap: 11 },
  comfortable: { pad: 10, gap: 20 },
} as const;

export const MENTIONS_METRICS = {
  /** SPEC §1 kabuğu + kullanıcı ayağı genişletmesi. Sol üç kolon 74 + 280 + 276 = 630. */
  shell: {
    borderWidth: 1,
    radius: 26,
    /** Bahsetme rayı. `flex:none`. */
    railWidth: 276,
    /** Bağlam paneli. `flex:none`. */
    contextPanelWidth: 326,
    /** Akışın asgari genişliği; bağlam paneli açıkken 404'e iner. */
    feedMinWidth: 730,
    feedMinWidthWithPanel: 404,
    /** Bağlam paneli bu genişliğin altında overlay olur (SPEC §1.1). */
    contextPanelOverlayBelow: 1100,
    /** Bahsetme rayı bu genişliğin altında drawer'a taşınır (SPEC §1.1). */
    railDrawerBelow: 960,
  },

  /** SPEC §3 — bahsetme rayı (276). */
  sidebar: {
    headerPaddingTop: 16,
    headerPaddingX: 16,
    headerPaddingBottom: 12,
    titleFontSize: 22,
    titleWeight: 700,
    titleLineHeight: 1,
    /** Okunmamış sayacı — okunmamış yoksa render edilmez. */
    badgeMinWidth: 22,
    badgeHeight: 20,
    badgePaddingX: 6,
    badgeRadius: 7,
    badgeFontSize: 11,
    badgeWeight: 600,

    actionRowPaddingX: 14,
    actionRowPaddingBottom: 12,
    actionRowGap: 7,
    markAllHeight: 36,
    markAllRadius: 11,
    markAllFontSize: 12.5,
    markAllWeight: 600,
    markAllGap: 7,
    markAllIconSize: 15,
    /** `0 8px 18px -12px hsl(var(--primary))` */
    markAllShadow: { x: 0, y: 8, blur: 18, spread: -12 },
    markAllHoverBrightness: 1.08,
    bellSize: 36,
    bellRadius: 11,
    bellIconSize: 17,

    searchPaddingX: 14,
    searchPaddingBottom: 12,
    searchHeight: 36,
    searchRadius: 11,
    searchInnerPaddingX: 11,
    searchGap: 9,
    searchIconSize: 15,
    searchFontSize: 13,

    sectionLabelPaddingX: 18,
    sectionLabelPaddingBottom: 7,
    sectionLabelGap: 7,
    sectionLabelIconSize: 12,
    sectionLabelFontSize: 10.5,
    sectionLabelWeight: 600,
    sectionLabelTracking: 0.15,
    /** `Kaynağa göre` satırının sağındaki toplam sayı. */
    sectionCountFontSize: 10.5,
    sectionCountAlpha: 0.8,

    listPaddingX: 10,
    listGap: 1,

    kindRowPaddingY: 9,
    kindRowPaddingX: 10,
    kindRowRadius: 12,
    kindRowGap: 10,
    kindRowTileSize: 28,
    kindRowTileRadius: 9,
    kindRowGlyphFontSize: 11.5,
    kindRowGlyphWeight: 600,
    kindRowTitleFontSize: 13.5,
    kindRowTitleLineHeight: 1.2,
    kindRowSubtitleMarginTop: 4,
    kindRowSubtitleFontSize: 11.5,
    kindRowSubtitleLineHeight: 1.2,
    kindRowPillMinWidth: 20,
    kindRowPillHeight: 20,
    kindRowPillPaddingX: 6,
    kindRowPillRadius: 7,
    kindRowPillFontSize: 11,
    kindRowPillWeight: 600,

    dividerMarginTop: 13,
    dividerMarginX: 16,
    dividerMarginBottom: 11,

    sourceRowPaddingY: 8,
    sourceRowPaddingX: 10,
    sourceRowRadius: 12,
    sourceRowGap: 10,
    sourceRowTileSize: 28,
    sourceRowTileRadius: 9,
    /** DM satırında tile yuvarlaktır (SPEC §3). */
    sourceRowTileRadiusDm: "50%",
    sourceRowTileFontSize: 12,
    sourceRowNameFontSize: 13,
    sourceRowNameLineHeight: 1.2,
    sourceRowCountFontSize: 11.5,

    transitionMs: 160,
  },

  /** SPEC §4 — akış başlığı. */
  feedHeader: {
    paddingY: 15,
    paddingX: 24,
    gapY: 12,
    gapX: 14,
    titleBlockGap: 10,
    titleFontSize: 16.5,
    titleWeight: 600,
    titleLineHeight: 1.2,
    countPillPaddingY: 3,
    countPillPaddingX: 9,
    countPillRadius: 999,
    countPillFontSize: 10.5,
    countPillWeight: 600,
    subtitleMarginTop: 5,
    subtitleFontSize: 12,
    subtitleWeight: 500,

    segmentPadding: 4,
    segmentGap: 4,
    segmentRadius: 13,
    tabHeight: 33,
    tabPaddingX: 13,
    tabRadius: 10,
    tabFontSize: 12.5,
    tabWeight: 600,
    tabGap: 6,
    tabPillMinWidth: 17,
    tabPillHeight: 17,
    tabPillPaddingX: 4,
    tabPillRadius: 6,
    tabPillFontSize: 10,
    tabPillWeight: 600,
    /** Aktif sekmenin pil zemini `hsl(0 0% 100%/0.22)` — opaklık, renk değil. */
    tabPillActiveAlpha: 0.22,

    iconGroupGap: 5,
    iconButtonSize: 34,
    iconButtonRadius: 11,
    iconSize: 17,
  },

  /** SPEC §5 — akış ve grup başlıkları. */
  feed: {
    paddingTop: 16,
    paddingX: 24,
    paddingBottom: 20,
    gap: 6,

    groupHeaderPaddingTop: 6,
    groupHeaderPaddingX: 2,
    groupHeaderPaddingBottom: 8,
    groupHeaderGap: 11,
    groupLabelFontSize: 10.5,
    groupLabelWeight: 600,
    groupLabelTracking: 0.14,
    groupCountAlpha: 0.75,

    groupBodyGap: 8,
    groupBodyPaddingBottom: 8,

    footerPaddingTop: 4,
    footerGap: 9,
    footerFontSize: 12,
  },

  /** SPEC §5 — bahsetme kartı. */
  card: {
    paddingTop: 13,
    paddingRight: 15,
    paddingBottom: 12,
    paddingLeft: 16,
    radius: 16,
    gap: 13,
    borderWidth: 1,
    /** Okunmuş kartın zemin opaklığı (`--surface-card/0.45`). */
    readSurfaceAlpha: 0.45,
    unreadBorderAlpha: 0.32,
    readBorderAlpha: 0.5,
    hoverSurfaceAlpha: 0.75,
    transitionMs: 140,

    stripeWidth: 3,
    stripeInset: 15,
    stripeRadius: 4,

    avatarSize: 36,

    topRowGap: 9,
    nameFontSize: 14,
    nameWeight: 600,
    nameLineHeight: 1.2,
    handleFontSize: 11.5,
    handleWeight: 500,
    dotSize: 3,
    sourceGap: 6,
    sourceTileSize: 17,
    sourceTileRadius: 6,
    sourceTileFontSize: 9,
    sourceFontSize: 11.5,
    sourceWeight: 500,
    trailingGap: 8,
    kindBadgePaddingY: 3,
    kindBadgePaddingX: 8,
    kindBadgeRadius: 999,
    kindBadgeFontSize: 10,
    kindBadgeWeight: 600,
    /** SPEC sessiz; HTML `.02em` veriyor (bkz. SPEC_DEVIATIONS). */
    kindBadgeLetterSpacing: 0.02,
    /** Tür pili zemini `tone/0.14`. */
    kindBadgeSurfaceAlpha: 0.14,
    timeFontSize: 11,
    timeWeight: 500,

    quoteMarginTop: 9,
    quotePaddingY: 7,
    quotePaddingX: 11,
    quoteGap: 9,
    quoteBorderLeftWidth: 2,
    quoteRadius: 10,
    quoteSurfaceAlpha: 0.55,
    quoteAuthorFontSize: 11.5,
    quoteAuthorWeight: 600,
    quoteTextFontSize: 11.5,
    quoteLineHeight: 1.4,

    bodyMarginTop: 7,
    bodyFontSize: 14,
    bodyLineHeight: 1.55,
    tagPaddingY: 1,
    tagPaddingX: 7,
    tagRadius: 7,
    tagFontSize: 13.5,
    tagWeight: 600,
    tagLineHeight: 1.5,
    tagSurfaceAlpha: 0.16,

    threadMarginTop: 8,
    threadGap: 7,
    threadIconSize: 13,
    threadFontSize: 11.5,
    threadWeight: 600,

    actionsMarginTop: 11,
    actionsGap: 7,
    actionHeight: 30,
    actionPaddingX: 12,
    actionRadius: 10,
    actionFontSize: 11.5,
    actionWeight: 600,
    actionGap: 6,
    actionIconSize: 13,
    actionBorderAlpha: 0.7,
    actionActiveSurfaceAlpha: 0.14,
    actionActiveBorderAlpha: 0.45,

    menuButtonSize: 28,
    menuButtonRadius: 9,
    menuButtonIconSize: 14,
    menuButtonGroupGap: 2,
  },

  /** SPEC §5.1 — kart `⋯` menüsü. */
  cardMenu: {
    width: 218,
    radius: 14,
    padding: 6,
    gap: 1,
    zIndex: 5,
    /** `0 20px 44px -22px hsl(var(--shadow-color))` */
    shadow: { x: 0, y: 20, blur: 44, spread: -22 },
    /** İlk iki kartta aşağı (`top`), sonrakilerde yukarı (`bottom`) — aynı ofset. */
    offset: 34,
    /** Aşağı açılan menünün uygulandığı kart sayısı (akışın başından). */
    downwardCardCount: 2,
    itemPaddingY: 8,
    itemPaddingX: 10,
    itemRadius: 10,
    itemGap: 10,
    itemFontSize: 12.5,
    itemWeight: 500,
    itemIconSize: 15,
    dangerWeight: 600,
    dangerHoverAlpha: 0.14,
    separatorMarginY: 4,
    separatorMarginX: 6,
    separatorAlpha: 0.7,
    transitionMs: 140,
  },

  /** SPEC §5.2 — satır içi yanıt kutusu. */
  replyBox: {
    marginTop: 11,
    paddingY: 11,
    paddingX: 12,
    radius: 13,
    surfaceAlpha: 0.8,
    borderAlpha: 0.35,

    metaGap: 8,
    metaMarginBottom: 9,
    metaIconSize: 13,
    metaFontSize: 11.5,
    metaStrongWeight: 600,

    inputRowGap: 9,
    avatarSize: 28,
    fieldHeight: 38,
    fieldRadius: 12,
    fieldPaddingX: 12,
    fieldGap: 9,
    fieldBorderAlpha: 0.7,
    fieldFontSize: 13.5,
    iconButtonSize: 26,
    iconButtonRadius: 8,
    iconSize: 15,
    sendSize: 38,
    sendRadius: 12,
    sendIconSize: 16,
    /** `0 8px 18px -12px hsl(var(--primary))` */
    sendShadow: { x: 0, y: 8, blur: 18, spread: -12 },

    hintsMarginTop: 9,
    hintsGap: 10,
    hintsFontSize: 11,
    hintStrongWeight: 600,
    cancelFontSize: 11.5,
    cancelWeight: 600,
  },

  /** SPEC §6 — bağlam paneli (326). */
  contextPanel: {
    headerPaddingTop: 15,
    headerPaddingX: 16,
    headerPaddingBottom: 13,
    headerGap: 10,
    titleFontSize: 14.5,
    titleWeight: 600,
    titleLineHeight: 1.2,
    sourceMarginTop: 5,
    sourceGap: 6,
    sourceTileSize: 16,
    sourceTileRadius: 5,
    sourceTileFontSize: 8.5,
    sourceFontSize: 11.5,
    closeSize: 30,
    closeRadius: 10,
    closeIconSize: 16,

    bodyPaddingY: 15,
    bodyPaddingX: 16,
    bodyGap: 14,
    rowGap: 10,
    rowAvatarSize: 28,
    rowNameFontSize: 12.5,
    rowNameWeight: 600,
    rowNameLineHeight: 1.2,
    rowTimeFontSize: 10.5,
    rowTimeWeight: 500,
    rowTextMarginTop: 4,
    rowTextFontSize: 12.5,
    rowTextLineHeight: 1.5,
    /** Bahsetmenin kendi satırı — vurgulu. */
    highlightPaddingY: 10,
    highlightPaddingX: 12,
    highlightRadius: 13,
    highlightSurfaceAlpha: 0.1,
    highlightBorderAlpha: 0.3,
    /** Diğer satırlar: `padding: 2px 0`, zemin/kenar yok. */
    plainPaddingY: 2,

    footerPaddingY: 13,
    footerPaddingX: 16,
    footerGap: 8,
    footerButtonHeight: 36,
    footerButtonRadius: 11,
    footerButtonPaddingX: 13,
    footerButtonFontSize: 12.5,
    footerButtonWeight: 600,
    /** `0 8px 18px -12px hsl(var(--primary))` */
    footerPrimaryShadow: { x: 0, y: 8, blur: 18, spread: -12 },
  },

  /** SPEC §7 — bildirim ayarları modalı (496). */
  settingsModal: {
    backdropPadding: 40,
    backdropAlpha: 0.62,
    width: 496,
    radius: 22,
    /** `0 40px 90px -40px hsl(var(--shadow-color))` */
    shadow: { x: 0, y: 40, blur: 90, spread: -40 },

    headerPaddingTop: 20,
    headerPaddingX: 24,
    headerPaddingBottom: 16,
    headerGap: 12,
    headerIconBox: 38,
    headerIconRadius: 13,
    headerIconSize: 19,
    headerIconSurfaceAlpha: 0.15,
    headerTitleFontSize: 17,
    headerTitleWeight: 600,
    headerTitleLineHeight: 1.2,
    headerSubtitleMarginTop: 5,
    headerSubtitleFontSize: 12.5,
    closeSize: 32,
    closeRadius: 11,
    closeIconSize: 17,

    bodyPaddingY: 19,
    bodyPaddingX: 24,
    bodyGap: 15,
    toggleRowGap: 14,
    toggleTitleFontSize: 13.5,
    toggleTitleWeight: 600,
    toggleTitleLineHeight: 1.3,
    toggleSubtitleMarginTop: 3,
    toggleSubtitleFontSize: 11.5,
    toggleSubtitleLineHeight: 1.4,
    switchWidth: 44,
    switchHeight: 26,
    switchRadius: 999,
    switchKnobSize: 20,
    switchKnobInset: 3,
    switchTransitionMs: 180,

    segmentPadding: 3,
    segmentGap: 3,
    segmentRadius: 11,
    segmentBorderAlpha: 0.6,
    segmentButtonHeight: 28,
    segmentButtonPaddingX: 11,
    segmentButtonRadius: 9,
    segmentButtonFontSize: 11.5,
    segmentButtonWeight: 600,

    quietPaddingY: 11,
    quietPaddingX: 13,
    quietRadius: 13,
    quietGap: 12,
    quietSurfaceAlpha: 0.8,
    quietBorderAlpha: 0.6,
    quietIconSize: 16,
    quietTitleFontSize: 12.5,
    quietTitleWeight: 600,
    quietTitleLineHeight: 1.3,
    quietSubtitleMarginTop: 3,
    quietSubtitleFontSize: 11.5,
    quietEditFontSize: 11.5,
    quietEditWeight: 600,

    footerPaddingTop: 16,
    footerPaddingX: 24,
    footerPaddingBottom: 20,
    footerGap: 10,
    footerNoteFontSize: 12,
    footerButtonHeight: 38,
    footerButtonRadius: 12,
    footerCancelPaddingX: 16,
    footerSavePaddingX: 18,
    footerButtonFontSize: 13,
    footerButtonWeight: 600,
    /** `0 10px 22px -14px hsl(var(--primary))` */
    footerSaveShadow: { x: 0, y: 10, blur: 22, spread: -14 },

    dividerAlpha: 0.6,
  },

  /** SPEC §8 — boş durum. */
  emptyState: {
    padding: 40,
    gap: 16,
    iconBox: 78,
    iconBoxRadius: 26,
    iconSize: 34,
    iconSurfaceAlpha: 0.14,
    iconBorderAlpha: 0.3,
    titleFontSize: 20,
    titleWeight: 600,
    titleLineHeight: 1.25,
    bodyMarginTop: 9,
    bodyMaxWidth: 420,
    bodyFontSize: 13.5,
    bodyLineHeight: 1.6,
    buttonRowGap: 9,
    buttonHeight: 38,
    buttonRadius: 12,
    /** SPEC sessiz; HTML her iki butonda 17 veriyor (bkz. SPEC_DEVIATIONS). */
    buttonPaddingX: 17,
    buttonFontSize: 13,
    buttonWeight: 600,
    /** `0 10px 22px -14px hsl(var(--primary))` */
    primaryShadow: { x: 0, y: 10, blur: 22, spread: -14 },
  },
} as const;

export type MentionsMetrics = typeof MENTIONS_METRICS;
