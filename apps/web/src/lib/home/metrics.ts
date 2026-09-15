/**
 * Ana Sayfa "1a Komuta Merkezi" ölçü sözlüğü.
 *
 * Kaynak sırası:
 *   1. `design_handoff/app_new/app/design/1a-komuta-merkezi.html` — inline `style` değerleri (nihai otorite)
 *   2. `design_handoff/app_new/app/SPEC-ANA-SAYFA.md` §1–§3
 *
 * Değerler ×1 ölçekteki **tasarım pikselidir**; tüketiciler `pxToRem` ile rem'e çevirir. Kabuk
 * yükselirken (SPEC §8.1) kök font boyutu değişir, sözlük değişmez.
 *
 * Sözlük renk taşımaz — yalnız ölçü, yarıçap, boşluk, ağırlık, satır yüksekliği ve süre. Gölge
 * kayıtlarındaki `alpha` bir opaklıktır, renk değil; tonu tüketici `hsl(var(--token)/alpha)` ile
 * verir.
 */

/** rem çıktısında kayan nokta artığı bırakmayacak kadar hassas, okunamayacak kadar uzun değil. */
const REM_PRECISION = 6;

/** Tasarım pikseli → rem. Kök font boyutu 16px kabulüyle (SPEC §8.2.1). */
export function pxToRem(px: number): string {
  return `${Number((px / 16).toFixed(REM_PRECISION))}rem`;
}

/**
 * Tasarım pikseli → em. **Yalnız ikon boyutları için** (SPEC §8.2.3): ikon içinde bulunduğu metnin
 * boyutuyla büyür, kök font boyutuyla değil. Başka her ölçü `pxToRem` kullanır.
 *
 * `basePx`, ikonun oturduğu satırın tasarım font boyutudur. Varsayılan 16 (kök); satır kendi
 * boyutunu veriyorsa (ör. nav satırı 14.5) o verilir, yoksa `em` ×1'de tasarım pikselini tutmaz —
 * 18px ikon 14.5px'lik bir satırda 16,3px çizilirdi.
 */
export function pxToEm(px: number, basePx = 16): string {
  return `${Number((px / basePx).toFixed(REM_PRECISION))}em`;
}

/**
 * Ölçeklenmeyen kenar/ayırıcı kalınlığı (SPEC §8.2.3). 4K'da 2px'e çıkan hairline tasarımı
 * kabalaştırır; `max()` fiziksel tabanı korur, rem tarafı da yüksek DPI'da eksik kalmaz.
 */
export function hairline(px = 1): string {
  return `max(${px}px, ${pxToRem(px)})`;
}

export const HOME_METRICS = {
  /** Kabuk — SPEC §2. `minWidth`/`minHeight` ölçek adımı seçiminin taban sözleşmesidir. */
  shell: {
    borderWidth: 1,
    minHeight: 920,
    minWidth: 1360,
    radius: 26,
  },

  /** Sunucu rayı — SPEC §2.1 (74 sabit). */
  rail: {
    width: 74,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 4,
    brandBox: 44,
    brandIcon: 40,
    brandRadius: 14,
    brandBarWidth: 3,
    brandBarGap: 3,
    brandBarHeights: [17, 25, 34, 24, 18],
    dividerWidth: 22,
    dividerHeight: 1,
    dividerMarginY: 9,
    itemPaddingY: 3,
    iconSize: 44,
    iconRadius: 15,
    iconFontSize: 15,
    /** Aktif sunucunun sol seçim çubuğu; yalnız sağ ucu yuvarlaktır. */
    activeIndicatorWidth: 4.5,
    activeIndicatorHeight: 34,
    activeIndicatorRadiusEnd: 5,
    badgeMinWidth: 17,
    badgeHeight: 17,
    badgeRadius: 6,
    badgePaddingX: 4,
    badgeBorderWidth: 2,
    badgeFontSize: 10,
    badgeOffsetTop: 1,
    badgeOffsetRight: 12,
    addButtonSize: 44,
    addButtonRadius: 15,
    addButtonBorderWidth: 1.5,
    addButtonIconSize: 19,
    addButtonIconStrokeWidth: 2.4,
    joinButtonSize: 41,
    joinButtonRadius: 14,
    joinButtonBorderWidth: 1.5,
    joinButtonIconSize: 17,
    joinButtonIconStrokeWidth: 2.2,
  },

  /**
   * Navigasyon paneli — kullanıcı ayağında avatar, ad ve üç kontrolü sıkıştırmadan taşımak için
   * 280px. Panel her rotada görünür; iç padding ve tipografi Mesajlar karar #2'deki sıkı ölçüleri
   * korur. Değişimin kaydı `lib/messages/metrics.ts` içindeki `NAV_PANEL_ADJUSTMENTS` tablosudur.
   */
  panel: {
    width: 280,
    headerPaddingTop: 16,
    headerPaddingX: 14,
    headerPaddingBottom: 14,
    navPaddingX: 9,
    navGap: 2,
    rowPaddingY: 10,
    rowPaddingX: 11,
    rowRadius: 13,
    rowGap: 12,
    iconSize: 18,
    iconStrokeWidth: 1.8,
    /** "Etkinlikler" satırının sağındaki saat. */
    trailingTimeFontSize: 11.5,
    dividerHeight: 1,
    dividerMarginTop: 14,
    dividerMarginX: 16,
    dividerMarginBottom: 12,
    sectionPaddingX: 16,
    sectionPaddingBottom: 8,
    sectionAddIconSize: 15,
    sectionAddIconStrokeWidth: 2,
    serverListPaddingX: 9,
    serverListGap: 1,
    serverRowPaddingY: 8,
    serverRowPaddingX: 9,
    serverRowRadius: 12,
    serverRowGap: 11,
    serverIconSize: 28,
    serverIconRadius: 9,
    serverIconFontSize: 12,
    serverNameFontSize: 13,
    serverOnlineGap: 4,
    serverOnlineDotSize: 6,
    serverOnlineFontSize: 11,
    serverBadgeMinWidth: 19,
    serverBadgeHeight: 19,
    serverBadgeRadius: 6,
    serverBadgePaddingX: 5,
    serverBadgeFontSize: 10.5,
    footerPaddingY: 14,
    footerPaddingX: 10,
    footerGap: 9,
    footerBorderTopWidth: 1,
    footerAvatarSize: 40,
    footerAvatarFontSize: 12,
    footerAvatarRingInner: 2.5,
    footerAvatarRingOuter: 6,
    footerPresenceDotSize: 11,
    footerPresenceDotBorderWidth: 2.5,
    footerStatusMarginTop: 5,
    footerStatusGap: 5,
    footerStatusDotSize: 6,
    footerActionGap: 1,
    footerActionSize: 28,
    footerActionRadius: 9,
    footerActionIconSize: 16,
    footerActionIconStrokeWidth: 1.8,
  },

  /** Ana alan üst çubuğu — SPEC §2.3. */
  topBar: {
    paddingTop: 24,
    paddingX: 30,
    paddingBottom: 14,
    gap: 24,
    titleGap: 12,
    focusPillPaddingY: 5,
    focusPillPaddingX: 11,
    focusPillGap: 6,
    focusPillDotSize: 6,
    subtitleMarginTop: 7,
    subtitleFontSize: 13.5,
    actionsGap: 10,
    searchWidth: 280,
    searchPaddingY: 9,
    searchPaddingX: 12,
    searchRadius: 13,
    searchGap: 9,
    searchBorderWidth: 1,
    searchIconSize: 16,
    searchIconStrokeWidth: 1.9,
    searchPlaceholderFontSize: 13,
    searchKbdPaddingY: 2,
    searchKbdPaddingX: 6,
    searchKbdRadius: 6,
    searchKbdFontSize: 10.5,
    searchKbdLineHeight: 1.4,
    bellSize: 40,
    bellRadius: 13,
    bellBorderWidth: 1,
    bellIconSize: 18,
    bellIconStrokeWidth: 1.8,
    bellDotSize: 7,
    bellDotBorderWidth: 2,
    bellDotOffsetTop: 8,
    bellDotOffsetRight: 9,
  },

  /** Bento ızgara — SPEC §3. */
  grid: {
    columns: 4,
    rows: 3,
    gap: 13,
    paddingTop: 8,
    paddingX: 30,
    paddingBottom: 18,
  },

  /**
   * Okunmamış sayacı — referans HTML'in `.w-badge` sınıfı. Tek bir kutu; navigasyon paneli
   * (SPEC §2.2) ve "Kaldığın yer" satırı (SPEC §3.1) aynı ölçüleri kullanır, iki kopya tutulmaz.
   */
  badge: {
    minWidth: 22,
    height: 20,
    radius: 7,
    paddingX: 6,
    fontSize: 11,
  },

  /** Komut paleti — Ayarlar referansındaki arama penceresinin birebir ölçüleri. */
  commandPalette: {
    width: 640,
    radius: 22,
    topOffset: 104,
    viewportPaddingX: 40,
    viewportPaddingBottom: 40,
    shadowY: 44,
    shadowBlur: 96,
    shadowSpread: 38,
    headerPaddingY: 16,
    headerPaddingX: 18,
    headerGap: 12,
    inputFontSize: 16,
    inputIconSize: 19,
    inputIconStrokeWidth: 1.9,
    escapePaddingY: 4,
    escapePaddingX: 8,
    escapeRadius: 8,
    escapeFontSize: 10.5,
    closeSize: 30,
    closeRadius: 10,
    closeIconSize: 16,
    tabsPaddingY: 12,
    tabsPaddingX: 16,
    tabsGap: 5,
    tabHeight: 30,
    tabPaddingX: 12,
    tabRadius: 10,
    tabFontSize: 12,
    tabCountFontSize: 10,
    listPaddingTop: 8,
    listPaddingX: 10,
    listPaddingBottom: 12,
    listMaxHeight: 430,
    groupLabelGap: 9,
    groupLabelPaddingTop: 9,
    groupLabelPaddingX: 8,
    groupLabelPaddingBottom: 7,
    groupRowsGap: 2,
    groupLabelFontSize: 10,
    groupLabelTracking: 0.15,
    rowRadius: 13,
    rowPaddingY: 9,
    rowPaddingX: 11,
    rowGap: 12,
    rowAvatarSize: 32,
    rowAvatarRadius: 11,
    rowAvatarFontSize: 13,
    rowTitleFontSize: 13.5,
    rowTitleLineHeight: 1.3,
    rowTitleGap: 8,
    rowSublabelFontSize: 11.5,
    rowSublabelMarginTop: 4,
    rowSublabelLineHeight: 1.4,
    rowHintPaddingY: 3,
    rowHintPaddingX: 7,
    rowHintRadius: 7,
    rowHintFontSize: 10,
    rowTagPaddingY: 2,
    rowTagPaddingX: 7,
    rowTagFontSize: 9.5,
    footerPaddingY: 12,
    footerPaddingX: 16,
    footerGap: 14,
    footerFontSize: 11,
    emptyPaddingY: 26,
  },

  /** Tüm kartların ortak kabuğu — SPEC §3. */
  card: {
    radius: 20,
    borderWidth: 1,
  },

  /** "KALDIĞIN YER" — SPEC §3.1. */
  continueCard: {
    columnSpan: 2,
    paddingTop: 16,
    paddingX: 16,
    paddingBottom: 12,
    headerMarginX: 2,
    headerMarginBottom: 10,
    headerLinkFontSize: 12,
    rowPadding: 10,
    rowRadius: 14,
    rowGap: 12,
    channelIconSize: 38,
    channelIconRadius: 12,
    channelIconFontSize: 17,
    avatarSize: 36,
    avatarFontSize: 11,
    presenceDotSize: 11,
    presenceDotBorderWidth: 2.5,
    titleGap: 8,
    previewMarginTop: 4,
    previewGap: 6,
    previewAvatarSize: 16,
    previewAvatarFontSize: 8,
    metaGap: 5,
    dmChipPaddingY: 2,
    dmChipPaddingX: 6,
    dmChipRadius: 5,
    dmChipFontSize: 10,
  },

  /** "ŞU AN CANLI" — SPEC §3.2. */
  liveCard: {
    columnSpan: 2,
    paddingTop: 16,
    paddingX: 16,
    paddingBottom: 14,
    headerMarginX: 2,
    headerMarginBottom: 12,
    headerGap: 6,
    pulseDotSize: 7,
    roomPadding: 13,
    roomRadius: 16,
    roomGap: 14,
    roomBorderWidth: 1,
    roomSpacing: 10,
    roomIconSize: 44,
    roomIconRadius: 14,
    roomIconGlyphSize: 21,
    roomIconStrokeWidth: 1.8,
    roomTitleGap: 9,
    speakerMarginTop: 7,
    speakerGap: 9,
    speakerAvatarSize: 20,
    speakerAvatarFontSize: 9,
    waveHeight: 16,
    waveGap: 2.5,
    waveBarWidth: 3,
    waveBarHeight: 14,
    waveBarRadius: 2,
    buttonHeight: 36,
    buttonPaddingX: 14,
    buttonRadius: 12,
    stackMarginTop: 13,
    stackMarginX: 2,
    stackGap: 10,
    stackAvatarSize: 28,
    stackAvatarFontSize: 10,
    stackRingWidth: 2,
    stackOverlap: 5,
    stackOverflowFontSize: 10.5,
    captionFontSize: 12,
  },

  /** "YANIT BEKLİYOR" — SPEC §3.3. */
  awaitingCard: {
    columnSpan: 2,
    padding: 20,
    gap: 6,
    headerMarginBottom: 8,
    headerGap: 9,
    newPillPaddingY: 3,
    newPillPaddingX: 8,
    newPillFontSize: 10.5,
    headerLinkFontSize: 12,
    rowPaddingY: 14,
    rowPaddingRight: 14,
    rowPaddingLeft: 12,
    rowRadius: 16,
    rowGap: 14,
    rowBorderWidth: 1,
    avatarSize: 36,
    avatarFontSize: 11,
    presenceDotSize: 11,
    presenceDotBorderWidth: 2.5,
    titleGap: 8,
    reasonMarginTop: 6,
    reasonFontSize: 13,
  },

  /** "DURUMUN" — SPEC §3.4. */
  presenceCard: {
    columnSpan: 1,
    padding: 16,
    chipGridColumns: 2,
    chipGridGap: 6,
    chipGridMarginTop: 12,
    chipPaddingY: 8,
    chipPaddingX: 10,
    chipRadius: 11,
    chipGap: 7,
    chipDotSize: 7,
    dividerHeight: 1,
    dividerMarginTop: 14,
    dividerMarginBottom: 12,
    dndGap: 10,
    dndTitleFontSize: 13,
    dndSubtitleMarginTop: 3,
    dndSubtitleFontSize: 11.5,
    toggleWidth: 42,
    toggleHeight: 23,
    toggleKnobSize: 18,
    toggleKnobOffsetTop: 2.5,
    toggleKnobOffsetLeftOn: 21.5,
    progressMarginTop: 12,
    progressHeight: 5,
    progressLabelMarginTop: 7,
  },

  /** "SIRADAKİ" — SPEC §3.5. */
  upNextCard: {
    columnSpan: 1,
    padding: 16,
    countFontSize: 11,
    timeRowMarginTop: 10,
    timeRowGap: 9,
    remainingPillPaddingY: 3,
    remainingPillPaddingX: 8,
    remainingPillFontSize: 10.5,
    titleMarginTop: 8,
    titleFontSize: 14.5,
    titleLineHeight: 1.3,
    contextMarginTop: 4,
    contextFontSize: 12,
    attendeesMarginTop: 12,
    attendeesGap: 9,
    attendeeAvatarGap: 6,
    attendeeAvatarSize: 24,
    attendeeAvatarFontSize: 9,
    attendeeAvatarRingWidth: 2,
    attendeeCaptionFontSize: 11.5,
    eventGap: 11,
    eventBorderTopWidth: 1,
    /** İlk etkinlik satırı, üstündeki katılımcı şeridinden 9 ile ayrılır; sonrakiler 8. */
    firstEventMarginTop: 9,
    firstEventPaddingTop: 9,
    eventMarginTop: 8,
    eventPaddingTop: 8,
    eventTimeColumnWidth: 38,
    eventTimeFontSize: 13,
    eventDayMarginTop: 2,
    eventDayFontSize: 9.5,
    eventSeparatorWidth: 1,
    eventSeparatorHeight: 26,
    eventTitleFontSize: 12.5,
    eventSubtitleMarginTop: 3,
    eventSubtitleFontSize: 11,
    footerPaddingTop: 12,
    footerGap: 7,
  },

  /** "ARKADAŞLAR" — SPEC §3.6. */
  friendsStrip: {
    columnSpan: 4,
    paddingTop: 12,
    paddingX: 16,
    paddingBottom: 13,
    gap: 10,
    headerGap: 10,
    headerOnlineFontSize: 12,
    headerTotalFontSize: 11.5,
    headerLinkFontSize: 12,
    headerLinkGap: 6,
    headerArrowSize: 14,
    headerArrowStrokeWidth: 2,
    cardsGap: 8,
    cardPaddingY: 7,
    cardPaddingRight: 10,
    cardPaddingLeft: 8,
    cardRadius: 14,
    cardGap: 8,
    avatarSize: 28,
    avatarFontSize: 10,
    presenceDotSize: 9,
    presenceDotBorderWidth: 2,
    statusMarginTop: 2,
  },

  /**
   * Yan ekranlar (Bahsedilmeler · Etkinlikler · Gelen kutusu) — `07-faz6` §1.
   *
   * Bu üç ekranın handoff'u **yok**. O yüzden burada yalnız iki tür sayı var:
   * (1) 07 numaralı dosyanın metninde birebir yazılı olanlar (`unreadStripeWidth`,
   * `calendarColumns`, `calendarMaxChips`), (2) mevcut gruplardan **aynen** alınan
   * ölçüler. Yeni bir yarıçap, yeni bir gölge, yeni bir tipografi rolü yok:
   * satırlar `awaitingCard`, çipler `presenceCard.chip*`, etkinlik satırı
   * `upNextCard.event*`, gün çipleri `badge`, yan panel genişliği `panel.width`.
   */
  sideScreens: {
    /** İçerik ızgarası kaydırıyor; yatay pay Ana Sayfa'nınkiyle aynı (`grid.paddingX`). */
    contentPaddingX: 30,
    contentPaddingBottom: 18,
    contentGap: 13,
    /** §2.1 birebir: okunmamış satırın solunda 3px `--primary`. */
    unreadStripeWidth: 3,
    /** Çipin kendisi `Durumun` kartındaki çip; aradaki boşluk oradaki ızgara boşluğu. */
    chipGap: 6,
    chipRowMarginBottom: 10,
    /** §3.3 birebir. */
    calendarColumns: 7,
    calendarMaxChips: 3,
    calendarGap: 6,
    calendarCellPadding: 6,
    calendarCellRadius: 12,
    calendarChipGap: 4,
    calendarWeekdayFontSize: 10.5,
    calendarWeekdayMarginBottom: 6,
    /** Bugünün hücresi — §3.3 birebir. */
    calendarTodayAlpha: 0.13,
    /** Gün paneli navigasyon panelinin genişliğinde; ikinci bir genişlik uydurulmadı. */
    dayPanelWidth: 280,
    dayPanelGap: 13,
  },

  /** Yarıçap listesi — SPEC §1. */
  radius: {
    shell: 26,
    card: 20,
    room: 16,
    requestRow: 16,
    listRow: 14,
    friendCard: 14,
    railIcon: 15,
    navRow: 13,
    serverRow: 12,
    statusChip: 11,
    iconSquareMin: 9,
    iconSquareMax: 12,
    badgeMin: 6,
    badgeMax: 7,
    pill: 999,
  },

  /**
   * Gölge listesi — SPEC §1. Yalnız geometri (`offsetX`/`offsetY`/`blur`/`spread`) ve opaklık;
   * ton tüketicideki token'dan gelir. Sıfır ofset ve negatif yayılma bu grupta normaldir.
   */
  shadow: {
    shell: { offsetX: 0, offsetY: 40, blur: 100, spread: -55, alpha: 0.85 },
    card: { offsetX: 0, offsetY: 1, blur: 2, alpha: 0.1 },
    activeServerIcon: { offsetX: 0, offsetY: 8, blur: 18, spread: -10 },
    railAddButton: { offsetX: 0, offsetY: 6, blur: 16, spread: -9 },
    railAddButtonHover: { offsetX: 0, offsetY: 12, blur: 24, spread: -10 },
    railJoinButton: { offsetX: 0, offsetY: 6, blur: 16, spread: -10 },
    brandLogo: { offsetX: 0, offsetY: 11, blur: 24, alpha: 0.17 },
  },

  /** Geçişler ve animasyonlar — SPEC §1. Süreler saniye, mesafeler tasarım pikseli. */
  motion: {
    /** saniye */
    durationBase: 0.16,
    /** saniye — arama alanı kenarı */
    durationSearchBorder: 0.18,
    /** saniye — `@keyframes pls` */
    pulseDuration: 2,
    /** px — nabzın ulaştığı halka yarıçapı */
    pulseSpread: 8,
    /** saniye — dalga formu çubuğu */
    waveDuration: 1,
    /** saniye — 2., 3. ve 4. çubuğun gecikmesi */
    waveDelays: [0.12, 0.26, 0.38],
    /** px — hover'da yükselme */
    hoverLift: 2,
  },
} as const;

export type HomeTypeScaleFamily = "body" | "display";

export type HomeTypeScaleStyle = {
  /** SPEC §1 tablosunda aralık verilen satırlarda üst uç (ör. aktif nav satırı). */
  activeWeight?: number;
  family: HomeTypeScaleFamily;
  /** SPEC satır yüksekliği vermediğinde tanımsız kalır — uydurulmaz. */
  lineHeight?: number;
  size: number;
  /** SPEC §1 tablosunda aralık verilen satırlarda üst uç. */
  sizeMax?: number;
  tracking?: string;
  transform?: "uppercase";
  weight: number;
};

/**
 * Tip ölçeği — SPEC §1'in 12 satırlık tablosu. "Arkadaş kartı adı / durumu" satırı iki ayrı stil
 * taşıdığı için iki anahtara ayrılır (`friendCardName` + `friendCardStatus`).
 */
export const HOME_TYPE_SCALE = {
  greeting: { family: "display", lineHeight: 1.1, size: 27, tracking: "-0.02em", weight: 600 },
  panelLogotype: { family: "display", lineHeight: 1, size: 22, tracking: "-0.02em", weight: 700 },
  cardBigNumber: { family: "display", lineHeight: 1, size: 27, weight: 600 },
  sectionLabel: {
    family: "display",
    lineHeight: 1,
    size: 10.5,
    tracking: "0.15em",
    transform: "uppercase",
    weight: 600,
  },
  navRow: { activeWeight: 600, family: "body", lineHeight: 1, size: 14, weight: 500 },
  cardRowName: { family: "body", lineHeight: 1.2, size: 14, weight: 600 },
  roomName: { family: "body", lineHeight: 1.2, size: 15, weight: 600 },
  secondaryLine: {
    activeWeight: 500,
    family: "body",
    lineHeight: 1.2,
    size: 12.5,
    sizeMax: 13,
    weight: 400,
  },
  contextLabel: { family: "body", size: 11.5, weight: 400 },
  timestamp: { family: "body", lineHeight: 1, size: 11.5, weight: 500 },
  friendCardName: { family: "body", lineHeight: 1.2, size: 12.5, weight: 600 },
  friendCardStatus: { family: "body", size: 10.5, weight: 400 },
  button: { family: "body", lineHeight: 1, size: 13, weight: 600 },
} as const satisfies Record<string, HomeTypeScaleStyle>;
