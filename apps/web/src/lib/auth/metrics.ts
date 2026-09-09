/**
 * Giriş · hesap oluşturma · kurtarma ölçü sözlüğü.
 *
 * Kaynak sırası:
 *   1. `design_handoff/giris-kayit-paketi/SPEC.md` §1.4, §2, §3, §4, §5, §6, §7, §8
 *   2. `design_handoff/giris-kayit-paketi/referans.html` inline `style` değerleri
 *
 * Değerler ×1 ölçekteki **tasarım pikselidir**; tüketiciler `pxToRem` / `pxToEm` ile çevirir.
 * Sözlük **renk taşımaz** — yalnız ölçü, yarıçap, boşluk, ağırlık, satır yüksekliği, süre ve
 * opaklık. Gölge ve katman kayıtlarındaki `alpha` bir opaklıktır, renk değil; tonu tüketici
 * `hsl(var(--token)/alpha)` ile verir.
 *
 * `web` / `desktop` / `mobile` dalları SPEC §4, §5 ve §6'nın ölçek kademeleridir. Bileşenlerin
 * içine `if (isDesktop)` yazılmaz; yüzey bağlamı hangi dalın okunacağını seçer (Ş7).
 */

export { hairline, pxToEm, pxToRem } from "@/lib/home/metrics";

/** SPEC §6 — dokunma hedefi bunun altına düşmez (kabul kriteri 7). */
export const AUTH_MIN_TAP_TARGET = 44;

export const AUTH_METRICS = {
  /** Pencere kabuğu — SPEC §4 giriş paragrafı ve §5. */
  window: {
    web: { width: 1280, height: 720, radius: 14, borderWidth: 1, borderAlpha: 0.55 },
    desktop: {
      width: 1040,
      height: 720,
      radius: 16,
      borderWidth: 1,
      borderAlpha: 0.55,
      titlebarHeight: 38,
      titlebarBorderAlpha: 0.35,
      titlebarPaddingLeft: 16,
      titlebarLabelSize: 11,
      titlebarLabelWeight: 600,
      controlWidth: 38,
      controlHeight: 28,
      minimizeGlyphSize: 13,
      maximizeGlyphSize: 10,
      closeGlyphSize: 12,
    },
    shadow: {
      web: { y: 30, blur: 64, spread: -30, alpha: 0.26 },
      desktop: { y: 26, blur: 58, spread: -26, alpha: 0.24 },
    },
  },

  /** Marka paneli — SPEC §3.3. */
  brand: {
    web: {
      width: 512,
      paddingY: 56,
      paddingX: 52,
      borderWidth: 1,
      borderAlpha: 0.5,
      ring: 150,
      ringOffsetLeft: -14,
      logoScale: 1.55,
      wordmarkSize: 42,
      wordmarkWeight: 700,
      wordmarkTracking: -0.025,
      taglineSize: 14.5,
      taglineMarginTop: 12,
      wordmarkMarginTop: 10,
      dividerHeight: 1,
      dividerAlpha: 0.6,
      dividerMarginTop: 34,
      dividerMarginBottom: 28,
      dividerMaxWidth: 300,
      headingSize: 21,
      headingWeight: 600,
      headingLeading: 1.35,
      headingTracking: -0.015,
      headingMaxCh: 16,
      bodySize: 13.5,
      bodyLeading: 1.65,
      bodyMarginTop: 14,
      bodyMaxCh: 36,
      bulletSize: 12.5,
      bulletDot: 5,
      bulletGap: 11,
    },
    desktop: {
      width: 376,
      paddingY: 40,
      paddingX: 38,
      ring: 104,
      logoScale: 1.2,
      wordmarkSize: 32,
      taglineSize: 13,
      dividerMaxWidth: 230,
      headingSize: 18,
      bodySize: 12.5,
    },
  },

  /** Form sütunu — SPEC §4 giriş paragrafı ve §5. */
  form: {
    web: { paddingX: 72, maxWidth: 384, registerPaddingX: 56, registerMaxWidth: 424 },
    desktop: { paddingX: 56, maxWidth: 352, registerPaddingX: 48, registerMaxWidth: 392 },
    mobile: { paddingX: 28 },
  },

  /** Ortak form tipografisi — SPEC §4 tablosu. */
  type: {
    eyebrow: { size: 10, weight: 600, leading: 1, tracking: 0.18 },
    title: {
      web: 29,
      desktop: 25,
      mobile: 27,
      weight: 600,
      leading: 1.2,
      tracking: -0.02,
      marginTop: 14,
    },
    description: { web: 13.5, desktop: 12.75, leading: 1.6, marginTop: 10 },
    label: { web: 12.5, desktop: 12, weight: 600, gap: 7 },
    hint: { size: 11.5 },
    linkSmall: { size: 12, weight: 600 },
    footerLink: { size: 13, weight: 600 },
  },

  /** Metin alanı — SPEC §1.4 ve §4 tablosu. */
  field: {
    height: { web: 46, desktop: 43, mobile: 49, compact: 44, backupCode: 52 },
    radius: { web: 12, desktop: 12, mobile: 14 },
    paddingX: 14,
    /** SPEC §4.4/1 — `Ad Soyad` · `Kullanıcı adı` iki kolonlu grid aralığı. */
    gridGap: 12,
    borderWidth: 1,
    fontSize: { web: 14, desktop: 13.5, mobile: 14.75 },
    focusBorderWidth: 1.5,
    focusRingWidth: 3,
    focusRingAlpha: 0.16,
    errorBorderWidth: 1.5,
    errorTintAlpha: 0.065,
    errorRingAlpha: 0.14,
    /** SPEC §4.4/3 — `Göster`/`Gizle` düğmesi ve alanın açtığı sağ dolgu. */
    revealHeight: 30,
    revealRadius: 8,
    revealFontSize: 11.5,
    revealWeight: 600,
    revealInsetRight: 7,
    revealPaddingX: 11,
    revealPaddingRight: 66,
    backupCodeFontSize: 18,
    backupCodeWeight: 600,
    backupCodeTracking: 0.14,
  },

  /** Düğmeler — SPEC §1.4, §4 tablosu, §4.8 ve §9. */
  button: {
    primary: {
      height: { web: 48, desktop: 46, mobile: 52 },
      radius: { web: 12, desktop: 12, mobile: 14 },
      fontSize: { web: 14.5, desktop: 14, mobile: 15 },
      weight: 600,
      shadow: { y: 12, blur: 26, spread: -12, alpha: 0.7 },
      hoverBrightness: 1.06,
      pressBrightness: 0.92,
      pressTranslateY: 1,
      focusRingInner: 3,
      focusRingOuter: 5,
      focusRingInnerAlpha: 0.28,
      focusRingOuterAlpha: 0.14,
      loadingBackgroundAlpha: 0.85,
      spinnerSize: 14,
      spinnerBorderWidth: 2,
      spinnerTrackAlpha: 0.35,
    },
    secondary: { borderWidth: 1, hoverBorderAlpha: 0.35, disabledOpacity: 0.6 },
    provider: {
      height: { web: 44, desktop: 42, mobile: 48 },
      radius: { web: 12, desktop: 12, mobile: 14 },
      tile: 22,
      tileRadius: 6,
      labelSize: 13.5,
      labelWeight: 500,
      soonBackgroundAlpha: 0.5,
      soonOpacity: 0.62,
      badgeHeight: 20,
      badgeRadius: 6,
      badgeFontSize: 9.5,
      badgeWeight: 700,
      badgeTracking: 0.1,
    },
  },

  /** Kod hücreleri — SPEC §4.2, §6. */
  codeCell: {
    count: 6,
    width: 54,
    height: 62,
    gap: 10,
    radius: { web: 12, mobile: 14 },
    digitSize: { web: 25, mobile: 24 },
    digitWeight: 600,
    emptyBackgroundAlpha: 0.6,
    caretWidth: 2,
    caretHeight: { web: 26, mobile: 24 },
  },

  /** Onay kutusu — SPEC §1.4, §4.1. */
  checkbox: {
    size: { web: 18, mobile: 20 },
    /**
     * SPEC etiket boyutunu yazmıyor; alan etiketi ölçeğiyle aynı tutuldu — 16px miras
     * alan bir onay kutusu etiketi formun geri kalanından iri duruyordu.
     */
    labelSize: 12.5,
    radius: 6,
    borderWidth: 1.5,
    tickSize: 11,
    focusRingWidth: 3,
    focusRingAlpha: 0.22,
    disabledOpacity: 0.55,
  },

  /** Pill ve segment — SPEC §1.4, §3.4, §4.7. */
  pill: {
    height: { web: 30, desktop: 28, mobile: 34 },
    radius: 999,
    dot: 6,
    fontSize: 12,
    weight: 600,
  },

  /** Ayırıcı (“veya”) — SPEC §4 tablosu. */
  divider: {
    lineHeight: 1,
    lineAlpha: 0.8,
    fontSize: 11.5,
    marginTop: 24,
    marginBottom: 18,
  },

  /** Şifre gücü — SPEC §4.4/4-5. */
  strength: {
    barHeight: 5,
    barRadius: 999,
    transitionMs: 250,
    labelSize: 11.5,
    labelWeight: 600,
    ruleColumns: 2,
    ruleRowGap: 5,
    ruleColumnGap: 14,
    ruleFontSize: 11.5,
    ruleDot: 14,
    ruleDotBorderWidth: 1,
    ruleTick: 8.5,
    ruleMarginTop: 9,
  },

  /** Turnstile satırı — SPEC §4.4/6. */
  turnstile: {
    height: 52,
    radius: 12,
    borderWidth: 1,
    backgroundAlpha: 0.7,
    tile: 20,
    hintSize: 10.5,
  },

  /** Hata/başarı bandı — SPEC §4.7 ve §8/2. */
  banner: {
    paddingY: 14,
    paddingX: 15,
    radius: 12,
    backgroundAlpha: 0.1,
    borderAlpha: 0.32,
    successBorderAlpha: 0.34,
    tile: 22,
    tileRadius: 7,
    glyphSize: 12,
    titleSize: 13,
    titleWeight: 600,
    bodySize: 12,
    bodyLeading: 1.55,
    bodyOpacity: 0.85,
  },

  /** Alan içi hata — SPEC §8/1. */
  fieldError: { fontSize: 12, glyphCircle: 15 },

  /** Başarı karosu ve kapanış ekranı — SPEC §4.7. */
  success: {
    tile: 52,
    tileRadius: 14,
    tileBackgroundAlpha: 0.14,
    tileBorderAlpha: 0.35,
    finalTileBackgroundAlpha: 0.16,
    finalTileBorderAlpha: 0.4,
    glyphSize: 24,
    marginBottom: 20,
    ring: 76,
    eyebrowMarginTop: 18,
    infoBandHeight: 44,
    infoBandRadius: 12,
    infoBandBorderAlpha: 0.7,
    infoBandDot: 7,
    infoBandFontSize: 12.5,
    infoBandWeight: 600,
    tipFontSize: 12,
    tipMarginTop: 16,
  },

  /** Durum kartı — SPEC §7. */
  statusCard: {
    width: 440,
    padding: 22,
    radius: 16,
    borderWidth: 1,
    borderAlpha: 0.7,
    shadow: { y: 14, blur: 32, spread: -22, alpha: 0.24 },
    tile: 24,
    tileRadius: 8,
    tileTintMin: 0.18,
    tileTintMax: 0.22,
    labelSize: 9.5,
    labelWeight: 700,
    labelTracking: 0.14,
    titleSize: 16.5,
    titleWeight: 600,
    titleLeading: 1.3,
    bodySize: 12.5,
    bodyLeading: 1.6,
  },

  /** Formu engelleyen blok — SPEC §8/3. */
  blocking: { iconTile: 56, titleSize: 29, bandHeight: 48 },

  /** Öneri etiketi — SPEC §9. */
  suggestionChip: { height: 30, radius: 999, paddingX: 12, fontSize: 12, weight: 600, tick: 11 },

  /** Alt bilgi — SPEC §3.5. */
  footer: {
    gap: 16,
    fontSize: { web: 11.5, mobile: 10.5 },
    web: { left: 72, right: 72, bottom: 30 },
    desktop: { left: 56, right: 56, bottom: 22 },
  },

  /** Dil ve tema seçici — SPEC §3.4. */
  selector: {
    height: { web: 30, desktop: 28, mobile: 34 },
    radius: 999,
    borderWidth: 1,
    borderAlpha: 0.8,
    backgroundAlpha: 0.85,
    paddingLeft: 12,
    paddingRight: 5,
    fontSize: 11.5,
    weight: 600,
    chevronCircle: 20,
    chevronSize: 8.5,
    chevronActiveAlpha: 0.16,
    menuWidth: 196,
    menuRadius: 14,
    menuPadding: 6,
    menuShadow: { y: 18, blur: 40, spread: -22, alpha: 0.4 },
    menuRowHeight: 38,
    menuRowRadius: 10,
    menuRowActiveAlpha: 0.12,
    menuTick: 11,
    themePadding: 3,
    segmentWidth: { web: 26, desktop: 24, mobile: 30 },
    segmentShadow: { y: 1, blur: 3, lightAlpha: 0.16, darkAlpha: 0.4 },
    web: { top: 26, right: 32 },
    desktop: { top: 18, right: 22 },
  },

  /** Aurora — SPEC §3.1. Yüzdeler radyalin boyut/konum çiftidir. */
  aurora: {
    web: {
      inset: -30,
      first: { width: 30, height: 34, x: 34, y: 38, alpha: 0.22, stop: 70 },
      second: { width: 26, height: 32, x: 68, y: 66, alpha: 0.12, stop: 72 },
      durationMs: 18000,
    },
    desktop: {
      inset: -32,
      first: { width: 32, height: 36, x: 30, y: 36, alpha: 0.22, stop: 70 },
      second: { width: 26, height: 30, x: 72, y: 70, alpha: 0.12, stop: 72 },
      durationMs: 16000,
    },
    mobile: {
      inset: -25,
      first: { width: 32, height: 26, x: 50, y: 26, alpha: 0.22, stop: 70 },
      second: { width: 30, height: 24, x: 62, y: 74, alpha: 0.12, stop: 72 },
      durationMs: 16000,
    },
    /** SPEC §3.1 son madde ve §4.7 — duruma göre değişen radyal opaklıkları. */
    tone: {
      dangerField: { second: 0.1 },
      dangerBanner: { second: 0.12 },
      dangerBlock: { first: 0.14, second: 0.06 },
      success: { second: 0.16 },
      successFinal: { first: 0.18, second: 0.16 },
    },
  },

  /** Logo işareti — SPEC §2. */
  logo: {
    size: 52,
    radius: 13,
    barWidth: 3,
    barGap: 3,
    barRadius: 999,
    barHeights: [17, 25, 34, 24, 18],
    barDelaysMs: [0, 130, 260, 390, 520],
    cycleMs: 2100,
    barMinScaleY: 0.5,
    barMinOpacity: 0.68,
    scale: { web: 1.55, desktop: 1.2, mobileHeading: 0.95, mobileInline: 0.72 },
    ring: { web: 150, desktop: 104, mobile: 74, glowMs: 3600, alpha: 0.26, stop: 66 },
  },

  /** Mobil cihaz çerçevesi — SPEC §6. */
  mobile: {
    deviceWidth: 390,
    deviceHeight: 844,
    deviceRadius: 44,
    statusBarHeight: 52,
    statusBarPaddingX: 30,
    statusBarFontSize: 13.5,
    statusBarWeight: 600,
    signalBarWidth: 3,
    signalBarGap: 2,
    signalBarHeights: [5, 7, 9, 11],
    batteryWidth: 22,
    batteryHeight: 11,
    batteryRadius: 3,
    batteryBorderWidth: 1,
    batteryPadding: 1.5,
    homeIndicatorWidth: 134,
    homeIndicatorHeight: 5,
    homeIndicatorAlpha: 0.22,
    homeIndicatorRadius: 999,
    backRowSquare: 36,
    inlineWordmarkSize: 19,
    phoneIconTile: 56,
    phoneIconTileAlpha: 0.14,
    minTapTarget: AUTH_MIN_TAP_TARGET,
  },

  /** Hareket — SPEC §3.2. */
  motion: {
    driftMs: 18000,
    glowMs: 3600,
    caretMs: 1100,
    spinMs: 800,
    driftTranslateX: 3,
    driftTranslateY: -2.5,
    driftScale: 1.06,
    glowMinOpacity: 0.45,
    glowMinScale: 0.94,
    glowMaxScale: 1.08,
  },
} as const;

export type AuthSurface = "desktop" | "mobile" | "web";
