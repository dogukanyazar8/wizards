/**
 * "Keşfet" ekranının ölçü sözlüğü.
 *
 * Kaynak sırası:
 *   1. `design_handoff/app_new/kesfet-paketi/referans/Kesfet-5B.dc.html` — inline `style` değerleri
 *      (**nihai otorite**)
 *   2. `design_handoff/app_new/kesfet-paketi/referans/Kesfet-referans.html` — çalışan kopya
 *   3. `design_handoff/app_new/kesfet-paketi/SPEC-KESFET.md` §1–§12
 *
 * Değerler ×1 ölçekteki **tasarım pikselidir**; tüketiciler `pxToRem` ile rem'e çevirir. Kabuk
 * yükselirken (SPEC-ANA-SAYFA §8.1) kök font boyutu değişir, sözlük değişmez.
 *
 * Sözlük **renk taşımaz** — yalnız ölçü, yarıçap, boşluk, ağırlık, satır yüksekliği ve süre.
 * Gölge kayıtlarındaki `alpha` bir opaklıktır, renk değil; tonu tüketici `hsl(var(--token)/alpha)`
 * ile verir.
 *
 * `// SPEC sessiz` yorumu, SPEC-KESFET'in o değeri hiç vermediğini ve sözlüğün doğrudan
 * `Kesfet-5B.dc.html` inline stilinden okuduğunu söyler. Sessizlik bir çelişki değildir ve
 * `SPEC_DEVIATIONS` listesine girmez.
 */

import { hairline, pxToEm, pxToRem } from "@/lib/home/metrics";

export { hairline, pxToEm, pxToRem };

/**
 * `Kesfet-5B.dc.html` ile SPEC arasındaki **sayısal** çelişkiler. Sözlük her satırda `html`
 * değerini kullanır.
 *
 * Bu liste bir kanıt kaydıdır: uygulayan şerit "SPEC 0.16s diyor, kod 140 yazmış" sorusuyla
 * karşılaştığında cevabı burada bulur.
 *
 * Keşfet SPEC'i doğrudan HTML'den çıkarıldığı için tek bir gerçek çelişki kaldı; SPEC'in sessiz
 * kaldığı yerler sözlükte `// SPEC sessiz` ile işaretlidir ve buraya girmez.
 */
export const SPEC_DEVIATIONS = [
  /**
   * SPEC-ANA-SAYFA §1 "Geçişler: tümü `0.16s` (renk/zemin/transform)" diyor. Keşfet'in
   * `dc.html` dosyası kart ve çip hover'ında `transition:border-color .14s,transform .14s`
   * yazıyor — kart ızgarası aynı anda düzinelerce elemanı hareket ettirdiği için tasarım
   * bilerek daha kısa bir süre seçmiş. Sözlük HTML'i alır.
   */
  { field: "transitions.hover", html: 140, spec: 160 },
] as const;

export const DISCOVER_METRICS = {
  /**
   * Kabuk — SPEC §1. Çerçeve `border-radius:26px`, `border:1px solid H(border,.55)`,
   * `box-shadow:0 40px 100px -55px H(shadow-color,.85)`.
   */
  shell: {
    borderWidth: 1,
    radius: 26,
    minWidth: 1360,
    minHeight: 920,
  },

  /**
   * SPEC §1 kolon şeması. `rail` ve `nav` yalnız referanstır — bu paket onları **çizmez**,
   * ölçü burada sadece 782/456 aritmetiğini kanıtlamak için durur.
   */
  columns: {
    /** Sunucu rayı — hazır, dokunulmaz. */
    rail: 74,
    /** Gezinme paneli — hazır, dokunulmaz. */
    nav: 228,
    /** Dizin kolonu (`flex:none`). */
    directory: 276,
    /** Sunucu profili paneli (`flex:none`). */
    panel: 326,
    /** Ana kolon panelsizken: 1360 − 74 − 228 − 276. */
    feedWidth: 782,
    /** Panel açıkken: 782 − 326. Izgara `minmax(262)` ile tek kolona iner, bu doğrudur. */
    feedWidthWithPanel: 456,
    /** SPEC §12 — panel bu genişliğin altında overlay olur. */
    panelOverlayBelow: 1100,
    /** SPEC §12 — dizin kolonu bu genişliğin altında drawer'a döner. */
    directoryDrawerBelow: 960,
    /** SPEC §12 — ızgara tek kolona iner, öne çıkan blok dikey yığılır. */
    singleColumnBelow: 720,
  },

  /** SPEC §3 — dizin kolonu (276). */
  sidebar: {
    borderWidth: 1,

    headerPaddingTop: 16,
    headerPaddingX: 16,
    headerPaddingBottom: 12,
    titleFontSize: 22,
    titleWeight: 700,
    titleLineHeight: 1,
    /** `letter-spacing:var(--w-track)` = `-0.02em` (SPEC-ANA-SAYFA §1). */
    titleLetterSpacing: -0.02,
    totalPillMinWidth: 22,
    totalPillHeight: 20,
    totalPillPaddingX: 6,
    totalPillRadius: 7,
    totalPillFontSize: 11,
    totalPillWeight: 600,

    searchPaddingX: 14,
    searchPaddingBottom: 12,
    searchHeight: 36,
    searchRadius: 11,
    searchPaddingInline: 11,
    searchGap: 9,
    searchIconSize: 15,
    /** SPEC sessiz — HTML `font-size:13px`. */
    searchFontSize: 13,
    searchClearSize: 20,
    searchClearRadius: 6,
    searchClearIconSize: 11,

    sectionLabelPaddingX: 18,
    sectionLabelPaddingBottom: 7,
    sectionLabelGap: 7,
    sectionLabelIconSize: 12,
    sectionLabelFontSize: 10.5,
    sectionLabelWeight: 600,
    sectionLabelLetterSpacing: 0.15,

    listPaddingX: 10,
    listGap: 1,

    categoryRowPaddingY: 9,
    categoryRowPaddingX: 10,
    categoryRowRadius: 12,
    categoryRowGap: 10,
    categoryTileSize: 28,
    categoryTileRadius: 9,
    categoryTileFontSize: 11,
    categoryTileWeight: 600,
    categoryLabelFontSize: 13.5,
    categoryLabelLineHeight: 1.2,
    categoryLabelWeightIdle: 500,
    categoryLabelWeightSelected: 600,
    categoryPillMinWidth: 20,
    categoryPillHeight: 20,
    categoryPillPaddingX: 6,
    categoryPillRadius: 7,
    categoryPillFontSize: 11,
    categoryPillWeight: 600,

    /** SPEC sessiz — `Kategoriler` ile `Sırala` arasındaki ayırıcı. */
    dividerMarginTop: 13,
    dividerMarginX: 16,
    dividerMarginBottom: 11,

    sortRowPaddingY: 8,
    sortRowPaddingX: 10,
    sortRowRadius: 12,
    sortRowGap: 10,
    sortDotSize: 8,
    sortDotMarginX: 10,
    /** SPEC sessiz — HTML `font:{500|600} 13px/1.2`. Kategori satırından 0.5px küçüktür. */
    sortLabelFontSize: 13,
    sortLabelLineHeight: 1.2,
    sortLabelWeightIdle: 500,
    sortLabelWeightSelected: 600,

    inviteCardPaddingY: 14,
    inviteCardPaddingX: 16,
    inviteTitleFontSize: 12.5,
    inviteTitleLineHeight: 1.3,
    inviteTitleWeight: 600,
    inviteBodyMarginTop: 4,
    inviteBodyFontSize: 11.5,
    inviteBodyLineHeight: 1.45,
    inviteButtonMarginTop: 10,
    inviteButtonHeight: 34,
    inviteButtonRadius: 11,
    /** SPEC sessiz — HTML `font:600 12px/1`. */
    inviteButtonFontSize: 12,
    inviteButtonWeight: 600,
  },

  /** SPEC §4.1 — akış başlığı. `flex-wrap:nowrap`; panel açıkken şerit ve ikon grubu gizlenir. */
  feedHeader: {
    paddingY: 15,
    paddingX: 24,
    gap: 14,
    borderWidth: 1,

    /** `flex:1 1 170px; min-width:0` */
    titleBlockFlexBasis: 170,
    titleFontSize: 16.5,
    titleLineHeight: 1.2,
    titleWeight: 600,
    titleLetterSpacing: -0.02,
    /** SPEC sessiz — başlık satırı ile alt satır arası. */
    subMarginTop: 5,
    subFontSize: 12,
    subLineHeight: 1,
    subWeight: 500,

    laneGroupPadding: 4,
    laneGroupGap: 4,
    laneGroupRadius: 13,
    laneGroupBorderWidth: 1,
    laneTabHeight: 33,
    laneTabPaddingX: 13,
    laneTabRadius: 10,
    laneTabGap: 6,
    laneTabFontSize: 12.5,
    laneTabWeight: 600,
    laneCountMinWidth: 17,
    laneCountHeight: 17,
    laneCountPaddingX: 4,
    laneCountRadius: 6,
    laneCountFontSize: 10,
    laneCountWeight: 600,

    iconGroupGap: 5,
    iconButtonSize: 34,
    /** SPEC sessiz — HTML `border-radius:11px`. */
    iconButtonRadius: 11,
    joinIconSize: 16,
    cardSizeIconSize: 17,
    /** `0 8px 18px -12px hsl(var(--primary))` */
    joinButtonShadow: { x: 0, y: 8, blur: 18, spread: -12 },
  },

  /**
   * SPEC §4.2 — öne çıkan sunucu bloğu. Yalnız Sunucular şeridi + `Tümü` + boş arama +
   * kapalı panel bileşiminde çizilir.
   */
  featured: {
    gap: 16,
    marginBottom: 18,
    paddingY: 17,
    paddingX: 18,
    radius: 20,
    borderWidth: 1,

    tileSize: 60,
    tileRadius: 20,
    tileFontSize: 22,
    tileWeight: 600,
    /** `0 12px 26px -14px hsl(var(--primary))` */
    tileShadow: { x: 0, y: 12, blur: 26, spread: -14 },

    /** `flex:1 1 260px; min-width:0` */
    textColFlexBasis: 260,
    badgeRowGap: 8,
    badgePaddingY: 3,
    badgePaddingX: 9,
    badgeRadius: 999,
    badgeFontSize: 10,
    badgeWeight: 600,
    badgeLetterSpacing: 0.04,
    onlineGap: 5,
    onlineFontSize: 10.5,
    onlineWeight: 600,
    onlineDotSize: 6,

    nameMarginTop: 9,
    nameFontSize: 18,
    nameLineHeight: 1.25,
    nameWeight: 600,
    nameLetterSpacing: -0.02,

    bodyMarginTop: 7,
    bodyFontSize: 13,
    bodyLineHeight: 1.55,
    bodyMaxWidth: 520,

    metaRowGap: 7,
    metaRowMarginTop: 12,
    metaPillPaddingY: 4,
    metaPillPaddingX: 10,
    metaPillRadius: 999,
    /** SPEC sessiz — HTML pili `1px solid H(border,.7)` ile çevreliyor. */
    metaPillBorderWidth: 1,
    metaPillFontSize: 11,
    metaPillWeight: 600,

    ctaColWidth: 146,
    ctaColGap: 8,
    ctaHeight: 38,
    ctaRadius: 12,
    ctaFontSize: 12.5,
    ctaWeight: 600,
  },

  /** SPEC §4.3 — bölüm başlığı (etiket · sayı · not · esneyen hairline). */
  sectionHead: {
    paddingTop: 2,
    paddingX: 2,
    paddingBottom: 11,
    gap: 11,
    labelFontSize: 10.5,
    labelWeight: 600,
    labelLetterSpacing: 0.14,
    countFontSize: 10.5,
    countWeight: 600,
    noteFontSize: 10.5,
    noteWeight: 500,
    hairlineHeight: 1,
  },

  /** SPEC §4.4 — sunucu kartı ve ızgarası. */
  serverCard: {
    /** `repeat(auto-fill, minmax(262px, 1fr))`; `Büyük` boyutta 330. */
    gridMin: 262,
    gridMinLarge: 330,
    gridGap: 12,

    radius: 18,
    borderWidth: 1,
    /** Hover'da kart 2px yükselir. */
    hoverLift: 2,

    bandHeight: 46,

    tileRowGap: 11,
    tileRowPaddingX: 14,
    /** Tile banda **oturur**: negatif margin + 3px halka çakışmayı önler. */
    tileMarginTop: -19,
    tileSize: 44,
    tileRadius: 14,
    tileRingWidth: 3,
    tileFontSize: 15,
    tileWeight: 600,

    nameGap: 6,
    namePaddingBottom: 2,
    nameFontSize: 14.5,
    nameLineHeight: 1.25,
    nameWeight: 600,
    nameLetterSpacing: -0.02,

    bodyPaddingTop: 10,
    bodyPaddingX: 14,
    metaGap: 9,
    metaFontSize: 11,
    metaWeight: 500,
    metaOnlineGap: 5,
    metaDotSize: 6,
    metaSeparatorSize: 3,

    descMarginTop: 9,
    descFontSize: 12.5,
    descLineHeight: 1.5,

    tagRowGap: 6,
    tagRowMarginTop: 11,
    tagPaddingY: 3,
    tagPaddingX: 9,
    tagRadius: 999,
    tagFontSize: 10.5,
    tagWeight: 600,

    actionRowMarginTop: 13,
    actionRowPaddingTop: 11,
    actionRowPaddingX: 14,
    actionRowPaddingBottom: 13,
    actionRowGap: 7,
    actionRowBorderWidth: 1,

    joinButtonHeight: 32,
    joinButtonRadius: 10,
    joinButtonGap: 6,
    joinButtonBorderWidth: 1,
    /** SPEC sessiz — HTML `font:600 11.5px/1`. */
    joinButtonFontSize: 11.5,
    joinButtonWeight: 600,
    previewButtonHeight: 32,
    previewButtonPaddingX: 12,
    previewButtonRadius: 10,
    previewButtonFontSize: 11.5,
    previewButtonWeight: 600,

    selectedStripeWidth: 3,
    selectedStripeInset: 16,
    /** SPEC sessiz — şeridin yalnız sağ ucu yuvarlaktır (`0 4px 4px 0`). */
    selectedStripeRadiusEnd: 4,
  },

  /** SPEC §4.5 — kişi kartı. */
  personCard: {
    paddingTop: 15,
    paddingX: 15,
    paddingBottom: 13,
    radius: 18,
    borderWidth: 1,
    gap: 12,

    headGap: 11,
    avatarSize: 44,
    presenceDotSize: 12,
    presenceDotRingWidth: 2.5,

    nameFontSize: 14,
    nameLineHeight: 1.25,
    nameWeight: 600,
    handleMarginTop: 4,
    handleFontSize: 11.5,
    handleLineHeight: 1.2,
    handleWeight: 500,

    mutualPaddingY: 8,
    mutualPaddingX: 10,
    mutualRadius: 11,
    mutualGap: 8,
    mutualIconSize: 13,
    mutualFontSize: 11.5,
    mutualLineHeight: 1.3,
    mutualWeight: 500,

    tagRowGap: 6,
    tagPaddingY: 3,
    tagPaddingX: 9,
    tagRadius: 999,
    tagFontSize: 10.5,
    tagWeight: 600,

    actionRowGap: 7,
    addButtonHeight: 32,
    addButtonRadius: 10,
    addButtonGap: 6,
    addButtonBorderWidth: 1,
    addButtonFontSize: 11.5,
    addButtonWeight: 600,
    profileButtonSize: 32,
    profileButtonRadius: 10,
    profileButtonIconSize: 14,
  },

  /** SPEC §4.6 — kanal satırı. Izgara değil, dikey liste. */
  channelRow: {
    listGap: 8,
    paddingY: 13,
    paddingX: 15,
    radius: 16,
    borderWidth: 1,
    gap: 13,

    tileSize: 38,
    tileRadius: 13,
    tileIconSize: 17,

    nameRowGap: 8,
    nameFontSize: 14,
    nameLineHeight: 1.25,
    nameWeight: 600,
    activityPillPaddingY: 3,
    activityPillPaddingX: 8,
    activityPillRadius: 999,
    activityPillFontSize: 10,
    activityPillWeight: 600,

    contextRowGap: 7,
    contextRowMarginTop: 5,
    contextTileSize: 15,
    contextTileRadius: 5,
    contextTileFontSize: 8,
    contextTileWeight: 600,
    contextFontSize: 11.5,
    contextLineHeight: 1.3,
    contextWeight: 500,

    trailingGap: 9,
    avatarStackSize: 24,
    avatarStackOverlap: -8,
    avatarStackRingWidth: 2,
    previewButtonHeight: 32,
    previewButtonPaddingX: 13,
    previewButtonRadius: 10,
    previewButtonFontSize: 11.5,
    previewButtonWeight: 600,
  },

  /** SPEC §4.7 — herkese açık etkinlik kartı. */
  eventCard: {
    radius: 18,
    borderWidth: 1,

    headGap: 11,
    headPaddingTop: 13,
    headPaddingX: 14,
    tileSize: 42,
    tileRadius: 14,
    tileFontSize: 15,
    tileWeight: 600,

    kindPillPaddingY: 3,
    kindPillPaddingX: 8,
    kindPillRadius: 999,
    kindPillFontSize: 10,
    kindPillWeight: 600,

    titleMarginTop: 7,
    titleFontSize: 14.5,
    titleLineHeight: 1.3,
    titleWeight: 600,
    titleLetterSpacing: -0.02,

    metaGap: 6,
    metaPaddingTop: 10,
    metaPaddingX: 14,
    whenGap: 7,
    whenFontSize: 12,
    whenLineHeight: 1.3,
    whenWeight: 600,
    whenIconSize: 13,
    whereFontSize: 11.5,
    whereLineHeight: 1.4,
    whereWeight: 500,
    interestedFontSize: 11.5,
    interestedLineHeight: 1.4,
    interestedWeight: 500,

    actionRowMarginTop: 13,
    actionRowPaddingTop: 11,
    actionRowPaddingX: 14,
    actionRowPaddingBottom: 13,
    actionRowGap: 7,
    actionRowBorderWidth: 1,
    interestButtonHeight: 32,
    interestButtonRadius: 10,
    interestButtonBorderWidth: 1,
    interestButtonFontSize: 11.5,
    interestButtonWeight: 600,
    detailButtonHeight: 32,
    detailButtonPaddingX: 12,
    detailButtonRadius: 10,
    detailButtonFontSize: 11.5,
    detailButtonWeight: 600,
  },

  /** SPEC §4.8 — filtre şeridi. Yalnız aktif filtre varken çizilir. */
  filterStrip: {
    paddingY: 11,
    paddingX: 24,
    gap: 8,
    borderWidth: 1,
    labelFontSize: 10.5,
    labelWeight: 600,
    labelLetterSpacing: 0.14,
    chipPaddingY: 5,
    chipPaddingLeft: 11,
    chipPaddingRight: 8,
    chipRadius: 999,
    chipBorderWidth: 1,
    chipGap: 7,
    chipFontSize: 11.5,
    chipWeight: 600,
    chipClearSize: 16,
    chipClearRadius: 5,
    chipClearIconSize: 9,
    clearAllFontSize: 11.5,
    clearAllWeight: 600,
  },

  /** SPEC §4.8 — katılım onay şeridi. */
  joinedBanner: {
    marginTop: 14,
    marginX: 24,
    paddingY: 12,
    paddingX: 14,
    radius: 14,
    borderWidth: 1,
    gap: 12,

    iconBoxSize: 30,
    iconBoxRadius: 10,
    iconSize: 16,

    titleFontSize: 13,
    titleLineHeight: 1.3,
    titleWeight: 600,
    detailMarginTop: 3,
    detailFontSize: 11.5,

    goButtonHeight: 32,
    goButtonPaddingX: 13,
    goButtonRadius: 10,
    goButtonFontSize: 11.5,
    goButtonWeight: 600,
    /** `0 8px 18px -12px hsl(var(--primary))` */
    goButtonShadow: { x: 0, y: 8, blur: 18, spread: -12 },
    closeSize: 28,
    closeRadius: 9,
    closeIconSize: 14,
  },

  /** SPEC §5 — sunucu profili paneli (326). */
  panel: {
    borderWidth: 1,

    headerPaddingTop: 15,
    headerPaddingX: 16,
    headerPaddingBottom: 13,
    headerGap: 10,
    labelFontSize: 10.5,
    labelWeight: 600,
    labelLetterSpacing: 0.15,
    categoryPillPaddingY: 3,
    categoryPillPaddingX: 8,
    categoryPillRadius: 999,
    categoryPillFontSize: 10,
    categoryPillWeight: 600,
    closeSize: 30,
    closeRadius: 10,
    closeIconSize: 16,

    bodyGap: 14,
    bodyPaddingY: 15,
    bodyPaddingX: 16,

    profileBlockPadding: 15,
    profileBlockRadius: 18,
    profileBlockBorderWidth: 1,
    profileBlockGap: 13,
    profileHeadGap: 13,
    /** SPEC §5.1: **negatif margin ve halka yoktur** — tile arka planla çakışmaz. */
    profileTileSize: 54,
    profileTileRadius: 17,
    profileTileFontSize: 19,
    profileTileWeight: 600,
    profileNameFontSize: 16.5,
    profileNameLineHeight: 1.25,
    profileNameWeight: 600,
    profileNameLetterSpacing: -0.02,
    profileMetaMarginTop: 6,
    profileMetaGap: 8,
    profileMetaFontSize: 11.5,
    profileMetaWeightOnline: 600,
    profileMetaWeightMembers: 500,
    profileMetaDotSize: 6,
    profileMetaSeparatorSize: 3,
    profileDescFontSize: 12.5,
    profileDescLineHeight: 1.6,
    profileTagRowGap: 6,
    profileTagPaddingY: 4,
    profileTagPaddingX: 10,
    profileTagRadius: 999,
    profileTagBorderWidth: 1,
    profileTagFontSize: 10.5,
    profileTagWeight: 600,

    statGridColumns: 3,
    statGridGap: 8,
    statBoxGap: 5,
    statBoxPaddingY: 11,
    statBoxPaddingX: 12,
    statBoxRadius: 14,
    statBoxBorderWidth: 1,
    statValueFontSize: 15,
    statValueWeight: 600,
    statLabelFontSize: 10.5,
    statLabelLineHeight: 1,

    sectionHeadGap: 8,
    sectionHeadPaddingBottom: 10,

    channelListGap: 2,
    channelRowPaddingY: 8,
    channelRowPaddingX: 9,
    channelRowRadius: 11,
    channelRowGap: 10,
    channelIconSize: 14,
    channelNameFontSize: 12.5,
    channelNameLineHeight: 1.3,
    channelNameWeight: 500,
    channelCountFontSize: 11,
    channelCountWeight: 500,

    mutualListGap: 2,
    mutualRowPaddingY: 7,
    mutualRowPaddingX: 8,
    mutualRowRadius: 12,
    mutualRowGap: 10,
    mutualAvatarSize: 28,
    mutualDotSize: 9,
    mutualDotRingWidth: 2,
    mutualNameFontSize: 12.5,
    mutualNameLineHeight: 1.3,
    mutualNameWeight: 500,
    mutualRolePillPaddingY: 3,
    mutualRolePillPaddingX: 8,
    mutualRolePillRadius: 999,
    mutualRolePillFontSize: 10,
    mutualRolePillWeight: 600,
    mutualNoteMarginTop: 9,
    mutualNoteFontSize: 11.5,
    mutualNoteLineHeight: 1.4,
    mutualNoteWeight: 500,

    footerPaddingY: 13,
    footerPaddingX: 16,
    footerGap: 8,
    footerBorderWidth: 1,
    ctaHeight: 36,
    /** SPEC sessiz — HTML `border-radius:11px`. */
    ctaRadius: 11,
    ctaFontSize: 12.5,
    ctaWeight: 600,
    /** `0 8px 18px -12px hsl(var(--primary))` */
    ctaShadow: { x: 0, y: 8, blur: 18, spread: -12 },
    shareHeight: 36,
    sharePaddingX: 13,
    shareRadius: 11,
    shareBorderWidth: 1,
    shareFontSize: 12.5,
    shareWeight: 600,
  },

  /** SPEC §6 — sunucuya katıl modalı (496). */
  joinModal: {
    backdropPadding: 40,
    backdropAlpha: 0.62,
    width: 496,
    radius: 22,
    borderWidth: 1,
    /** `0 40px 90px -40px hsl(var(--shadow-color))` */
    shadow: { x: 0, y: 40, blur: 90, spread: -40 },

    headerPaddingTop: 20,
    headerPaddingX: 24,
    headerPaddingBottom: 16,
    headerGap: 12,
    headerBorderWidth: 1,
    headerIconBoxSize: 38,
    /** SPEC sessiz — HTML `border-radius:13px`. */
    headerIconBoxRadius: 13,
    headerIconSize: 19,
    titleFontSize: 17,
    titleLineHeight: 1.2,
    titleWeight: 600,
    titleLetterSpacing: -0.02,
    subtitleMarginTop: 5,
    subtitleFontSize: 12.5,
    closeSize: 32,
    closeRadius: 11,
    closeIconSize: 17,

    bodyGap: 15,
    bodyPaddingY: 19,
    bodyPaddingX: 24,

    /** SPEC sessiz — modal etiketi 11px/.13em; ekranın 10.5px/.15em etiketiyle aynı değildir. */
    fieldLabelFontSize: 11,
    fieldLabelWeight: 600,
    fieldLabelLetterSpacing: 0.13,
    fieldLabelPaddingBottom: 8,
    codeFieldHeight: 42,
    codeFieldRadius: 12,
    codeFieldPaddingX: 13,
    codeFieldGap: 9,
    codeFieldBorderWidth: 1,
    codePrefixFontSize: 13,
    codePrefixWeight: 500,
    codeInputFontSize: 13.5,
    codeInputWeight: 600,
    pasteButtonHeight: 30,
    pasteButtonPaddingX: 12,
    pasteButtonRadius: 9,
    pasteButtonFontSize: 11.5,
    pasteButtonWeight: 600,
    codeHelpMarginTop: 8,
    codeHelpFontSize: 11.5,
    codeHelpLineHeight: 1.5,

    dividerGap: 11,
    dividerHeight: 1,
    dividerLabelFontSize: 10.5,
    dividerLabelWeight: 600,
    dividerLabelLetterSpacing: 0.14,

    optionListGap: 7,
    optionRowPaddingY: 10,
    optionRowPaddingX: 12,
    optionRowRadius: 13,
    optionRowGap: 11,
    optionRowBorderWidth: 1,
    optionTileSize: 34,
    optionTileRadius: 11,
    optionTileFontSize: 13,
    optionTileWeight: 600,
    optionNameFontSize: 13,
    optionNameLineHeight: 1.3,
    optionNameWeight: 600,
    optionMetaMarginTop: 4,
    optionMetaFontSize: 11.5,
    radioSize: 20,
    radioBorderWidth: 1.5,
    radioDotSize: 8,

    visibilityRowGap: 14,
    visibilityRowPaddingY: 11,
    visibilityRowPaddingX: 13,
    visibilityRowRadius: 13,
    visibilityRowBorderWidth: 1,
    visibilityTitleFontSize: 12.5,
    visibilityTitleLineHeight: 1.3,
    visibilityTitleWeight: 600,
    visibilityHelpMarginTop: 3,
    visibilityHelpFontSize: 11.5,
    toggleWidth: 44,
    toggleHeight: 26,
    toggleRadius: 999,
    toggleKnobSize: 20,
    toggleKnobInset: 3,
    /** Açık konumdaki knob sol koordinatı: 44 − 20 − 3. */
    toggleKnobOffsetOn: 21,
    /** `0 2px 6px hsl(var(--shadow-color)/.6)` */
    toggleKnobShadow: { x: 0, y: 2, blur: 6, spread: 0 },

    footerPaddingTop: 16,
    footerPaddingX: 24,
    footerPaddingBottom: 20,
    footerGap: 10,
    footerBorderWidth: 1,
    termsFontSize: 12,
    cancelHeight: 38,
    cancelPaddingX: 16,
    cancelRadius: 12,
    cancelBorderWidth: 1,
    cancelFontSize: 13,
    cancelWeight: 600,
    submitHeight: 38,
    submitPaddingX: 18,
    submitRadius: 12,
    submitFontSize: 13,
    submitWeight: 600,
    /** `0 10px 22px -14px hsl(var(--primary))` */
    submitShadow: { x: 0, y: 10, blur: 22, spread: -14 },
  },

  /** SPEC §4.9 — boş durum. */
  emptyState: {
    gap: 16,
    padding: 40,
    iconBoxSize: 78,
    /** SPEC sessiz — HTML `border-radius:26px`, kabuk yarıçapıyla aynı. */
    iconBoxRadius: 26,
    iconBoxBorderWidth: 1,
    iconSize: 34,
    textMaxWidth: 430,
    titleFontSize: 20,
    titleLineHeight: 1.25,
    titleWeight: 600,
    titleLetterSpacing: -0.02,
    bodyMarginTop: 9,
    bodyFontSize: 13.5,
    bodyLineHeight: 1.6,
    buttonRowGap: 9,
    buttonHeight: 38,
    buttonPaddingX: 17,
    buttonRadius: 12,
    buttonFontSize: 13,
    buttonWeight: 600,
    /** `0 10px 22px -14px hsl(var(--primary))` */
    primaryButtonShadow: { x: 0, y: 10, blur: 22, spread: -14 },
  },

  /** SPEC §4.9 — hata durumu. Boş durumdan üç yerde ayrılır: metin genişliği, ikon, kod satırı. */
  errorState: {
    gap: 16,
    padding: 40,
    iconBoxSize: 78,
    iconBoxRadius: 26,
    iconBoxBorderWidth: 1,
    iconSize: 34,
    /** Boş durumda 430, burada 440 — metin bir satır daha uzun. */
    textMaxWidth: 440,
    titleFontSize: 20,
    titleLineHeight: 1.25,
    titleWeight: 600,
    titleLetterSpacing: -0.02,
    bodyMarginTop: 9,
    bodyFontSize: 13.5,
    bodyLineHeight: 1.6,
    buttonRowGap: 9,
    buttonHeight: 38,
    buttonPaddingX: 17,
    buttonRadius: 12,
    buttonFontSize: 13,
    buttonWeight: 600,
    retryButtonGap: 8,
    retryIconSize: 15,
    primaryButtonShadow: { x: 0, y: 10, blur: 22, spread: -14 },
    codeLineFontSize: 11.5,
  },

  /**
   * SPEC §2 — kabuğa değen iki yüzey. Bu paket sol tarafı **çizmez**; ölçüler Ş8'in `Yeni`
   * pilini SPEC ile aynı boyda basabilmesi için burada durur.
   */
  joinedShell: {
    navRowPaddingY: 8,
    navRowPaddingX: 9,
    navRowRadius: 12,
    navRowBorderWidth: 1,
    navRowGap: 10,
    navTileSize: 28,
    navTileRadius: 9,
    /** SPEC sessiz — `Yeni` satırının tile'ı diğer satırlardan 1px küçük yazar (11 ↔ 12). */
    navTileFontSize: 11,
    navTileWeight: 600,
    navNameFontSize: 13,
    navNameLineHeight: 1.2,
    navNameWeight: 600,
    newPillPaddingY: 2,
    newPillPaddingX: 6,
    newPillRadius: 6,
    newPillFontSize: 9.5,
    newPillWeight: 600,
    railTileSize: 44,
    railTileRadius: 15,
    railTileBorderWidth: 1.5,
    railTileFontSize: 13,
    railTileWeight: 600,
    /** `0 6px 16px -10px hsl(var(--warning))` */
    railTileShadow: { x: 0, y: 6, blur: 16, spread: -10 },
  },

  /** SPEC §7 + SPEC-ANA-SAYFA §1 — süreler (ms). */
  transitions: {
    /** Renk/zemin geçişleri. */
    base: 160,
    /** Kart ve çip hover'ı — bkz. `SPEC_DEVIATIONS`. */
    hover: 140,
    /** Arama alanı kenarı ve görünürlük anahtarı. */
    searchBorder: 180,
    /** SPEC §7 — arama debounce'u (K9). */
    searchDebounce: 250,
  },
} as const;
