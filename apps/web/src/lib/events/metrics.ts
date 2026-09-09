/**
 * "Etkinlikler" ekranının (4B · Takvim şeridi) ölçü sözlüğü.
 *
 * Kaynak sırası:
 *   1. `design_handoff/app_new/etkinlikler-paketi/referans/Etkinlikler-4B.dc.html` — inline `style`
 *      değerleri (**nihai otorite**)
 *   2. `design_handoff/app_new/etkinlikler-paketi/referans/Etkinlikler-referans.html` — çalışan kopya
 *   3. `design_handoff/app_new/etkinlikler-paketi/SPEC-ETKINLIKLER.md` §1–§11
 *
 * Değerler ×1 ölçekteki **tasarım pikselidir**; tüketiciler `pxToRem` ile rem'e çevirir. Kabuk
 * yükselirken (SPEC-ANA-SAYFA §8.1) kök font boyutu değişir, sözlük değişmez. Referans HTML
 * ölçeği `zoom` ile taklit eder; üretimde `zoom` kullanılmaz (tuzak #9).
 *
 * Sözlük **renk taşımaz** — yalnız ölçü, yarıçap, boşluk, ağırlık, satır yüksekliği ve süre.
 * Gölge ve zemin kayıtlarındaki `alpha` bir opaklıktır, renk değil; tonu tüketici
 * `hsl(var(--token)/alpha)` ile verir. Tür tonları ise `@wizards/types` içindeki
 * `EVENT_KIND_TONE` haritasında **token adı** olarak durur.
 */

import { hairline, pxToEm, pxToRem } from "@/lib/home/metrics";

export { hairline, pxToEm, pxToRem };

/**
 * `Etkinlikler-4B.dc.html` ile `SPEC-ETKINLIKLER.md` / `PROMPT.md` arasındaki çelişkiler.
 * Sözlük her satırda `html` değerini kullanır.
 *
 * Bu liste bir kanıt kaydıdır: uygulayan şerit "PROMPT ay diyor, kod hafta yazmış" sorusuyla
 * karşılaştığında cevabı burada bulur.
 */
export const SPEC_DEVIATIONS = [
  /**
   * K9 — HTML `title` değerleri ("Önceki hafta" / "Sonraki hafta") oklara **hafta** adımı
   * veriyor; PROMPT'un kabul kriteri "ay ileri/geri" diyor. Otorite sırası HTML'i öne aldığı
   * için hafta kazanır: aksi hâlde ok tıklaması şeridin gösterdiği yedi günü atlar.
   */
  { field: "weekStrip.arrowStep", html: "week", spec: "month" },
  /** SPEC §3.6 ve HTML ikisi de tür pilinde `letter-spacing` vermiyor → sözlükte `null`. */
  { field: "card.kindPillLetterSpacing", html: null, spec: null },
  /**
   * SPEC §4 sağ ray bölüm başlığı "Katılacağım"; `.dc.html` içinde "Katılımım" **bir kez**
   * geçiyor ama o dize 4A'nın sol filtre kolonundadır ve 4B'de hiç çizilmez.
   */
  { field: "agendaRail.goingSectionLabel", html: "Katılacağım", spec: "Katılımım" },
  /**
   * SPEC §3.1 başlık metnini yalnız sekme ve arama dallarıyla anlatıyor; HTML `feedTitle`
   * ayrıca kaynak filtresi seçiliyken **kaynak adını**, `time === 'today'` iken **`Bugün`**
   * yazıyor. HTML davranışı alınır; SPEC bu iki dalda sessizdir.
   */
  { field: "feedHeader.titleBranches", html: 5, spec: 3 },
  /**
   * SPEC §8 `dayBucket` için dört değer sayıyor (`Bugün/Yarın/Bu hafta/Geçmiş`); HTML grup
   * sırası üçünü çiziyor ve `Geçmiş` süzülüp atılıyor. Tip dörtte kalır, ızgara üçünü çizer.
   */
  { field: "grid.dayBucketCount", html: 3, spec: 4 },
] as const;

/**
 * SPEC-ANA-SAYFA §8.3 dilinde yoğunluk: ölçek büyüdükçe artan yükseklik boşlukla değil
 * **içerikle** dolar. `lib/events/density.ts` (Ş5) bu tabloyu tüketir; sözlük yalnız
 * sayfalama tavanlarını taşır.
 */
export const EVENTS_DENSITY = {
  1: { gridPageSize: 12, agendaRows: 4, goingRows: 3 },
  1.15: { gridPageSize: 14, agendaRows: 5, goingRows: 4 },
  1.5: { gridPageSize: 18, agendaRows: 6, goingRows: 5 },
  2: { gridPageSize: 24, agendaRows: 8, goingRows: 6 },
} as const;

export const EVENTS_METRICS = {
  /** SPEC §1 — kabuk. Değerler Ana Sayfa kabuğuyla aynı; sözlük onları tekrar eder ki
   *  tüketici `lib/home/metrics`'e doğrudan bakmak zorunda kalmasın. */
  shell: {
    borderWidth: 1,
    radius: 26,
    borderAlpha: 0.55,
    /** `0 40px 100px -55px hsl(var(--shadow-color)/.85)` */
    shadow: { x: 0, y: 40, blur: 100, spread: -55, alpha: 0.85 },
    minWidth: 1360,
    minHeight: 920,
  },

  /** SPEC §1 kolon şeması. `railWidth` ve `navPanelWidth` **dokunulmaz**; burada yalnız
   *  yerleşim hesabı doğru çıksın diye duruyorlar. */
  columns: {
    railWidth: 74,
    navPanelWidth: 228,
    agendaRailWidth: 300,
    detailPanelWidth: 326,
    /** Panelsiz ana kolon. */
    feedWidth: 758,
    /** Detay paneli açıkken ana kolon buraya iner; başlık **sarmaz** (SPEC §3.1). */
    feedWidthWithPanel: 432,
    /** SPEC §11 — detay paneli bu genişliğin altında overlay olur, ajanda rayı gizlenir. */
    detailPanelOverlayBelow: 1100,
    /** Hafta şeridi yatay kaydırmalı olur, ızgara tek kolona düşer. */
    singleColumnBelow: 960,
    /** Sağ ray tamamen kalkar; "Bugün" ajandası ızgaranın üstünde katlanır bloğa döner. */
    agendaRailDropsBelow: 720,
    /** Ayırıcı opaklığı: kabuk kolonları `.4`, sayfa kolonları `.45`. */
    shellDividerAlpha: 0.4,
    pageDividerAlpha: 0.45,
  },

  /** SPEC §3.1 — akış başlığı. `flex-wrap:nowrap`; sarma yasak. */
  feedHeader: {
    paddingY: 15,
    paddingX: 24,
    gap: 14,
    borderBottomAlpha: 0.45,

    /** `flex:1 1 170px;min-width:0` */
    titleBlockBasis: 170,
    titleRowGap: 10,
    titleFontSize: 16.5,
    titleWeight: 600,
    titleLineHeight: 1.2,
    titleLetterSpacing: -0.02,
    subMarginTop: 5,
    subFontSize: 12,
    subWeight: 500,
    subLineHeight: 1,

    tabGroupGap: 4,
    tabGroupPadding: 4,
    tabGroupRadius: 13,
    tabGroupBorderAlpha: 0.55,
    tabHeight: 33,
    tabPaddingX: 13,
    tabRadius: 10,
    tabGap: 6,
    tabFontSize: 12.5,
    tabWeight: 600,

    tabPillMinWidth: 17,
    tabPillHeight: 17,
    tabPillPaddingX: 4,
    tabPillRadius: 6,
    tabPillFontSize: 10,
    tabPillWeight: 600,
    /**
     * Aktif sekmenin pil zemini tasarımda `hsl(0 0% 100%/.22)` — primary zemin üstündeki ters
     * metin ailesinin bir parçası (PROMPT §4'ün tek renk istisnası). Sözlük yalnız opaklığı
     * taşır; beyazı tüketici yazar.
     */
    tabPillActiveAlpha: 0.22,

    iconGroupGap: 5,
    iconButtonSize: 34,
    iconButtonRadius: 11,
    createIconSize: 16,
    /** `0 8px 18px -12px hsl(var(--primary))` */
    createShadow: { x: 0, y: 8, blur: 18, spread: -12 },
    densityIconSize: 17,
    bellIconSize: 17,
    /** Zil açıkken zemin `hsl(var(--primary)/.15)`. */
    bellActiveAlpha: 0.15,
    hoverBrightness: 1.08,

    /** Sapma kaydı #4: `Etkinlikler / Canlı / Katılacağım / Arama sonuçları / Bugün` + kaynak adı. */
    titleBranches: 5,
  },

  /** SPEC §3.2 — hafta şeridi. */
  weekStrip: {
    paddingY: 13,
    paddingX: 24,
    gap: 12,
    borderBottomAlpha: 0.45,
    /** Zemin `hsl(var(--surface-panel)/.5)`. */
    surfaceAlpha: 0.5,

    navGroupGap: 6,
    arrowSize: 28,
    arrowRadius: 9,
    arrowBorderAlpha: 0.7,
    arrowIconSize: 14,
    /** Sapma kaydı #1 (K9). */
    arrowStep: "week",

    monthLabelMinWidth: 112,
    monthLabelFontSize: 13,
    monthLabelWeight: 600,

    gridColumns: 7,
    gridGap: 6,
    dayPaddingTop: 8,
    dayPaddingX: 4,
    dayPaddingBottom: 7,
    dayRadius: 13,
    dayGap: 5,
    dayBorderAlpha: 0.55,
    dowFontSize: 9.5,
    dowWeight: 600,
    dowLetterSpacing: 0.12,
    numFontSize: 17,
    numWeight: 600,
    dotRowHeight: 6,
    dotGap: 3,
    dotSize: 5,
    /** Noktalar o günün türlerinden gelir, **en çok 4** (SPEC §3.2). */
    maxDots: 4,
    todaySurfaceAlpha: 0.14,
    todayBorderAlpha: 0.45,
  },

  /** SPEC §3.3 — filtre şeridi. Yalnız aktif filtre varken çizilir. */
  filterBar: {
    paddingY: 11,
    paddingX: 24,
    gap: 8,
    borderBottomAlpha: 0.45,
    /** Zemin `hsl(var(--primary)/.06)`. */
    surfaceAlpha: 0.06,

    labelFontSize: 10.5,
    labelWeight: 600,
    labelLetterSpacing: 0.14,

    chipPaddingTop: 5,
    chipPaddingRight: 8,
    chipPaddingBottom: 5,
    chipPaddingLeft: 11,
    chipGap: 7,
    chipRadius: 999,
    chipBorderAlpha: 0.4,
    chipFontSize: 11.5,
    chipWeight: 600,
    chipRemoveSize: 16,
    chipRemoveRadius: 5,
    chipRemoveIconSize: 9,

    clearAllFontSize: 11.5,
    clearAllWeight: 600,
  },

  /** SPEC §3.4 — RSVP onay şeridi. */
  rsvpStrip: {
    marginTop: 14,
    marginX: 24,
    paddingY: 12,
    paddingX: 14,
    radius: 14,
    gap: 12,
    surfaceAlpha: 0.12,
    borderAlpha: 0.35,

    iconSize: 30,
    iconRadius: 10,
    iconSurfaceAlpha: 0.2,
    iconGlyphSize: 16,

    titleFontSize: 13,
    titleWeight: 600,
    titleLineHeight: 1.3,
    subMarginTop: 3,
    subFontSize: 11.5,

    actionHeight: 32,
    actionPaddingX: 13,
    actionRadius: 10,
    actionFontSize: 11.5,
    actionWeight: 600,

    closeSize: 28,
    closeRadius: 9,
    closeIconSize: 14,
  },

  /** SPEC §3.5 — kaydırma alanı, gün grupları ve ızgara. */
  grid: {
    scrollPaddingTop: 16,
    scrollPaddingX: 24,
    scrollPaddingBottom: 20,
    scrollGap: 4,

    groupHeaderPaddingTop: 6,
    groupHeaderPaddingX: 2,
    groupHeaderPaddingBottom: 10,
    groupHeaderGap: 11,
    groupLabelFontSize: 10.5,
    groupLabelWeight: 600,
    groupLabelLetterSpacing: 0.14,
    groupCountAlpha: 0.75,
    groupDateFontSize: 10.5,
    groupDateWeight: 500,
    groupRuleAlpha: 0.5,

    /** K11 — `--e-min`. Kart boyutu ikonu bu iki değeri değiştirir. */
    minColumnWidth: 280,
    minColumnWidthLarge: 340,
    gap: 12,
    rowPaddingBottom: 16,

    /** Sapma kaydı #5: tip dört kova taşır, ızgara üçünü çizer. */
    dayGroupCount: 3,

    footerPaddingTop: 4,
    footerGap: 9,
    footerFontSize: 12,
    footerRuleAlpha: 0.4,
  },

  /** SPEC §3.6 — etkinlik kartı. Üç nokta menüsü **yoktur**. */
  card: {
    radius: 18,
    paddingX: 14,
    /** Katılmayan kartın zemini `hsl(var(--surface-card)/.6)`. */
    idleSurfaceAlpha: 0.6,
    borderAlpha: 0.6,
    selectedBorderAlpha: 0.5,
    goingBorderAlpha: 0.4,
    hoverBorderAlpha: 0.45,
    hoverTranslateY: -2,
    transitionSeconds: 0.14,

    topPaddingTop: 13,
    topGap: 11,
    kindTileSize: 42,
    kindTileRadius: 14,
    kindGlyphFontSize: 15,
    kindGlyphWeight: 600,
    /** Tür soft zemini `hsl(var(--token)/.14)`. */
    kindSurfaceAlpha: 0.14,

    badgeRowGap: 7,
    kindPillPaddingY: 3,
    kindPillPaddingX: 8,
    kindPillRadius: 999,
    kindPillFontSize: 10,
    kindPillWeight: 600,
    /** Sapma kaydı #2 — SPEC de HTML de sessiz. */
    kindPillLetterSpacing: null,

    livePillGap: 5,
    livePillDotSize: 5,
    livePillSurfaceAlpha: 0.16,

    metaFontSize: 10.5,
    metaWeight: 500,

    titleMarginTop: 7,
    titleFontSize: 15,
    titleWeight: 600,
    titleLineHeight: 1.3,
    titleLetterSpacing: -0.02,

    timePaddingTop: 10,
    timeBlockGap: 6,
    timeRowGap: 7,
    timeIconSize: 13,
    timeFontSize: 12,
    timeWeight: 600,
    timeLineHeight: 1.3,

    sourceTileSize: 16,
    sourceTileRadius: 5,
    sourceTileFontSize: 8.5,
    placeFontSize: 11.5,
    placeWeight: 500,

    attendeesPaddingTop: 11,
    attendeesGap: 9,
    avatarSize: 24,
    /** İkinciden itibaren `margin-left:-8px`. */
    avatarOverlap: -8,
    avatarRing: 2,
    /** SPEC §3.6 — önizleme **en çok 3** avatar. */
    maxAvatars: 3,
    attendeeTextFontSize: 11.5,
    attendeeTextWeight: 500,

    actionsMarginTop: 12,
    actionsPaddingTop: 11,
    actionsPaddingBottom: 13,
    actionsGap: 7,
    actionsBorderTopAlpha: 0.5,
    /** Eylem satırı zemini `hsl(var(--surface-soft)/.35)`. */
    actionsSurfaceAlpha: 0.35,

    actionHeight: 32,
    actionRadius: 10,
    actionFontSize: 11.5,
    actionWeight: 600,
    joinIconSize: 13,
    joinGap: 6,
    maybePaddingX: 12,
    /** Seçili durum zeminleri: katılıyor `success/.16`, belki `warning/.16`. */
    actionActiveSurfaceAlpha: 0.16,
    actionActiveBorderAlpha: 0.45,
    actionIdleBorderAlpha: 0.7,

    selectedStripeWidth: 3,
    selectedStripeInset: 16,
    selectedStripeRadius: 4,
  },

  /** SPEC §4 — sağ ajanda rayı (300). Detay paneli açıldığında **gizlenir**. */
  agendaRail: {
    headerPaddingTop: 15,
    headerPaddingX: 16,
    headerPaddingBottom: 13,
    headerGap: 10,
    headerBorderAlpha: 0.45,
    titleFontSize: 14.5,
    titleWeight: 600,
    titleLineHeight: 1.2,
    subMarginTop: 5,
    subFontSize: 11.5,
    subWeight: 500,

    bodyPaddingY: 14,
    bodyPaddingX: 16,
    rowGap: 11,
    hourColumnWidth: 44,
    hourFontSize: 11.5,
    hourWeight: 600,
    ruleWidth: 1.5,
    ruleMarginY: 6,
    ruleAlpha: 0.7,
    rowPaddingBottom: 14,

    cardPaddingY: 10,
    cardPaddingX: 11,
    cardRadius: 13,
    cardGap: 9,
    cardBorderAlpha: 0.6,
    cardStripeWidth: 3,
    cardStripeRadius: 3,
    cardTitleFontSize: 12.5,
    cardTitleWeight: 600,
    cardSubMarginTop: 4,
    cardSubFontSize: 11,
    cardSubLineHeight: 1.3,
    liveDotSize: 6,
    liveDotMarginTop: 3,
    selectedSurfaceAlpha: 0.1,
    selectedBorderAlpha: 0.35,

    dividerMarginTop: 2,
    dividerMarginBottom: 14,
    dividerAlpha: 0.5,

    /** Sapma kaydı #3. */
    goingSectionLabel: "Katılacağım",
    goingLabelFontSize: 10.5,
    goingLabelWeight: 600,
    goingLabelLetterSpacing: 0.15,
    goingHeaderGap: 8,
    goingHeaderPaddingBottom: 10,
    goingListGap: 7,
    goingRowPaddingY: 9,
    goingRowPaddingX: 11,
    goingRowRadius: 13,
    goingRowGap: 10,
    goingRowBorderAlpha: 0.6,
    goingTileSize: 30,
    goingTileRadius: 10,
    goingTileFontSize: 12,
    goingChevronSize: 14,

    footerPaddingY: 13,
    footerPaddingX: 16,
    footerBorderAlpha: 0.5,
    footerButtonHeight: 36,
    footerButtonRadius: 11,
    footerButtonGap: 7,
    footerButtonFontSize: 12.5,
    footerButtonWeight: 600,
    footerButtonIconSize: 14,
  },

  /**
   * SPEC §5 — etkinlik detay paneli (326). Ajanda rayının yerini alır.
   *
   * Zemin `--surface-panel` (HTML `:483`), `--surface-card` **değil**; SPEC bu noktada sessiz.
   */
  detailPanel: {
    headerPaddingTop: 15,
    headerPaddingX: 16,
    headerPaddingBottom: 13,
    headerGap: 10,
    headerBorderAlpha: 0.45,
    kindTileSize: 38,
    kindTileRadius: 13,
    kindGlyphFontSize: 14,
    pillRowGap: 7,
    kindPillPaddingY: 3,
    kindPillPaddingX: 8,
    kindPillFontSize: 10,
    durationFontSize: 11,
    durationWeight: 500,
    titleMarginTop: 7,
    titleFontSize: 15.5,
    titleWeight: 600,
    titleLineHeight: 1.25,
    titleLetterSpacing: -0.02,
    closeSize: 30,
    closeRadius: 10,
    closeIconSize: 16,

    bodyGap: 15,
    bodyPaddingY: 15,
    bodyPaddingX: 16,

    infoCardPaddingY: 12,
    infoCardPaddingX: 13,
    infoCardRadius: 14,
    infoCardGap: 10,
    infoCardBorderAlpha: 0.6,
    infoRowGap: 10,
    infoIconSize: 15,
    infoTextFontSize: 12.5,
    infoTextWeight: 600,
    infoTextLineHeight: 1.3,
    sourceTileSize: 15,
    sourceTileRadius: 5,
    sourceTileFontSize: 8,
    whereFontSize: 12,
    whereWeight: 500,
    whereLineHeight: 1.4,
    hostAvatarSize: 20,

    sectionLabelFontSize: 10.5,
    sectionLabelWeight: 600,
    sectionLabelLetterSpacing: 0.15,
    descriptionMarginTop: 9,
    descriptionFontSize: 12.5,
    descriptionLineHeight: 1.6,

    attendeeHeaderGap: 8,
    attendeeHeaderPaddingBottom: 10,
    attendeeListGap: 2,
    attendeeRowPaddingY: 7,
    attendeeRowPaddingX: 8,
    attendeeRowRadius: 11,
    attendeeRowGap: 10,
    attendeeAvatarSize: 28,
    attendeeNameFontSize: 12.5,
    attendeeNameWeight: 500,
    rolePillPaddingY: 3,
    rolePillPaddingX: 8,
    rolePillFontSize: 10,
    rolePillWeight: 600,
    /** Rol pili soft zemini `hsl(var(--token)/.16)`. */
    rolePillSurfaceAlpha: 0.16,
    moreMarginTop: 5,
    morePaddingY: 6,
    morePaddingX: 8,
    moreFontSize: 11.5,
    moreWeight: 600,

    reminderPaddingY: 11,
    reminderPaddingX: 13,
    reminderRadius: 14,
    reminderGap: 11,
    /** Zemin `hsl(var(--surface-secondary)/.8)`. */
    reminderSurfaceAlpha: 0.8,
    reminderBorderAlpha: 0.6,
    reminderIconSize: 16,
    reminderTitleFontSize: 12,
    reminderTitleWeight: 600,
    reminderSubMarginTop: 3,
    reminderSubFontSize: 11,
    reminderActionFontSize: 11.5,
    reminderActionWeight: 600,

    footerPaddingY: 13,
    footerPaddingX: 16,
    footerGap: 8,
    footerBorderAlpha: 0.5,
    footerButtonHeight: 36,
    footerButtonRadius: 11,
    footerButtonFontSize: 12.5,
    footerButtonWeight: 600,
    footerSharePaddingX: 13,
    /** `0 8px 18px -12px hsl(var(--primary))` */
    footerCtaShadow: { x: 0, y: 8, blur: 18, spread: -12 },
  },

  /** SPEC §6 — etkinlik oluştur modalı (560). */
  createModal: {
    overlayPadding: 40,
    overlayAlpha: 0.62,
    width: 560,
    cardRadius: 22,
    /** `0 40px 90px -40px hsl(var(--shadow-color))` */
    cardShadow: { x: 0, y: 40, blur: 90, spread: -40 },

    headerPaddingTop: 20,
    headerPaddingX: 24,
    headerPaddingBottom: 16,
    headerGap: 12,
    headerBorderAlpha: 0.6,
    headerIconSize: 38,
    headerIconRadius: 13,
    headerIconSurfaceAlpha: 0.15,
    headerIconGlyphSize: 19,
    titleFontSize: 17,
    titleWeight: 600,
    titleLineHeight: 1.2,
    subtitleMarginTop: 5,
    subtitleFontSize: 12.5,
    closeSize: 32,
    closeRadius: 11,
    closeIconSize: 17,

    bodyGap: 15,
    bodyPaddingY: 19,
    bodyPaddingX: 24,
    fieldLabelFontSize: 11,
    fieldLabelWeight: 600,
    fieldLabelLetterSpacing: 0.13,
    fieldLabelPaddingBottom: 8,
    fieldRowGap: 11,

    kindColumns: 3,
    kindGridGap: 7,
    kindBoxPaddingY: 10,
    kindBoxPaddingX: 11,
    kindBoxRadius: 13,
    kindBoxGap: 7,
    kindBoxBorderAlpha: 0.7,
    kindBoxSelectedSurfaceAlpha: 0.1,
    kindBoxSelectedBorderAlpha: 0.45,
    kindTileSize: 26,
    kindTileRadius: 9,
    kindTileFontSize: 11,
    kindNameFontSize: 12,
    kindNameWeight: 600,
    kindNameLineHeight: 1.2,

    inputHeight: 40,
    inputPaddingX: 13,
    inputRadius: 12,
    inputBorderAlpha: 0.7,
    inputFontSize: 13.5,
    fieldGap: 9,
    fieldIconSize: 15,
    fieldValueFontSize: 13,
    fieldValueWeight: 500,

    durationOptions: 3,
    durationSegmentGap: 3,
    durationSegmentPadding: 3,
    durationSegmentRadius: 12,
    durationSegmentBorderAlpha: 0.6,
    durationButtonRadius: 9,
    durationButtonFontSize: 11.5,
    durationButtonWeight: 600,

    placeTileSize: 18,
    placeTileRadius: 6,
    placeTileFontSize: 9,
    placeChevronSize: 14,

    publicRowGap: 14,
    publicRowPaddingY: 11,
    publicRowPaddingX: 13,
    publicRowRadius: 13,
    publicRowSurfaceAlpha: 0.8,
    publicRowBorderAlpha: 0.6,
    publicTitleFontSize: 12.5,
    publicTitleWeight: 600,
    publicSubMarginTop: 3,
    publicSubFontSize: 11.5,

    toggleWidth: 44,
    toggleHeight: 26,
    toggleKnobSize: 20,
    toggleKnobInset: 3,
    toggleKnobOffsetOn: 21,
    toggleTransitionSeconds: 0.18,

    footerPaddingTop: 16,
    footerPaddingX: 24,
    footerPaddingBottom: 20,
    footerGap: 10,
    footerBorderAlpha: 0.6,
    footerNoteFontSize: 12,
    footerButtonHeight: 38,
    footerButtonRadius: 12,
    footerCancelPaddingX: 16,
    footerSubmitPaddingX: 18,
    footerButtonFontSize: 13,
    footerButtonWeight: 600,
    /** `0 10px 22px -14px hsl(var(--primary))` */
    footerSubmitShadow: { x: 0, y: 10, blur: 22, spread: -14 },
  },

  /** SPEC §3.7 — boş durum. */
  emptyState: {
    padding: 40,
    gap: 16,
    iconBox: 78,
    iconBoxRadius: 26,
    iconSize: 34,
    iconSurfaceAlpha: 0.13,
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
    buttonPaddingX: 17,
    buttonFontSize: 13,
    buttonWeight: 600,
    /** `0 10px 22px -14px hsl(var(--primary))` */
    primaryShadow: { x: 0, y: 10, blur: 22, spread: -14 },
  },

  /** SPEC §3.8 — hata durumu. Boş durumla aynı geometri, iki farkla. */
  errorState: {
    padding: 40,
    gap: 16,
    iconBox: 78,
    iconBoxRadius: 26,
    iconSize: 34,
    iconSurfaceAlpha: 0.13,
    iconBorderAlpha: 0.3,
    titleFontSize: 20,
    titleWeight: 600,
    titleLineHeight: 1.25,
    bodyMarginTop: 9,
    /** Boş durumdan 20 px geniş: hata metni bir satır daha uzun. */
    bodyMaxWidth: 440,
    bodyFontSize: 13.5,
    bodyLineHeight: 1.6,
    buttonRowGap: 9,
    buttonHeight: 38,
    buttonRadius: 12,
    buttonPaddingX: 17,
    buttonGap: 8,
    buttonIconSize: 15,
    buttonFontSize: 13,
    buttonWeight: 600,
    codeLineFontSize: 11.5,
    codeLineAlpha: 0.85,
  },

  /** SPEC §2 — gezinme panelindeki saat ipucu, bu ekranın sola değen tek noktası. */
  navHint: {
    fontSize: 11.5,
    weight: 600,
    gap: 5,
    /** Canlı etkinlik varsa ipucundan önce 6 px `--danger` nokta. */
    liveDotSize: 6,
  },
} as const;

export type EventsMetrics = typeof EVENTS_METRICS;
