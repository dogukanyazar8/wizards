/**
 * "Bildirimler + Ayarlar pencereleri" paketinin ölçü sözlüğü.
 *
 * Kaynak sırası:
 *   1. `design_handoff/app_new/ayarlar-paketi/referans/Ayarlar-referans.dc.html` — inline `style`
 *      değerleri (**nihai otorite**)
 *   2. `design_handoff/app_new/ayarlar-paketi/referans/Ayarlar-referans.html` — çalışan kopya
 *   3. `design_handoff/app_new/ayarlar-paketi/SPEC-AYARLAR.md`
 *   4. `design_handoff/app_new/ayarlar-paketi/PROMPT.md`
 *
 * Değerler ×1 ölçekteki **tasarım pikselidir** (1360×920 kabuk); tüketiciler `pxToRem` ile
 * rem'e çevirir. Ekran büyürken kök font boyutu değişir (SPEC-ANA-SAYFA §8.1), sözlük değişmez.
 * Referans HTML ölçeği `zoom` ile taklit eder; üretimde `zoom` kullanılmaz (tuzak #8).
 *
 * Sözlük **renk taşımaz** — yalnız ölçü, yarıçap, boşluk, ağırlık, satır yüksekliği ve süre.
 * Kayıtlardaki `alpha` bir opaklıktır, renk değil; tonu tüketici `hsl(var(--token)/alpha)` ile
 * verir. Ton gerektiğinde token **adı** yazılır (`"--danger"`), değeri değil.
 */

import { hairline, pxToEm, pxToRem } from "@/lib/home/metrics";

export { hairline, pxToEm, pxToRem };

/**
 * `Ayarlar-referans.dc.html` ile `SPEC-AYARLAR.md` / `PROMPT.md` arasındaki çelişkiler ve
 * bilinçli ayrılmalar. İlk dokuz kayıt `00-ortak-baglam.md` §4'teki sırayla; sonrakiler
 * uygulama ve güvenlik doğrulamasında bulunan açık ürün kararlarıdır.
 *
 * Bu liste bir kanıt kaydıdır: uygulayan şerit "SPEC 13/10 diyor, kod 14/9 yazmış" sorusuyla
 * karşılaştığında cevabı burada bulur.
 */
export const SPEC_DEVIATIONS = [
  /**
   * #1 — SPEC §5.3 tema sayımını "13 Koyu + 10 Açık" veriyor; `lib/appearance.ts` içindeki 23
   * kaydın gerçek dağılımı 14 koyu + 9 açık. K6 tema kimliklerini korur, yalnız görünen adı
   * tasarımın listesinden atar; koyu/açık etiketi **koddan** okunur. Sayımı SPEC'e uydurmak bir
   * kullanıcının temasını değiştirmek demekti.
   */
  { field: "themeGrid.darkLightSplit", html: "14/9", spec: "13/10" },
  /**
   * #2 — "Boşta sayılma süresi" tasarımın hiçbir yüzeyinde yok; menü beş satıra sabit (K9).
   * Tercih ölmez, Hesabım › Gizlilik › Görünürlük grubuna satır olarak iner. Tasarımda olmayan
   * **tek** satır budur.
   */
  { field: "privacy.visibility.rowCount", html: 3, spec: 4 },
  /**
   * #3 — Başlıktaki Web / Masaüstü segmenti referansta var, üründe çizilmez (K11): çalışma
   * zamanı zaten bilinir, segment bir inceleme aracıdır. Geometrisi `header.runtimeSegment`
   * altında duruyor çünkü başlığın kalan boşluğu ona göre hesaplandı.
   */
  { field: "header.runtimeSegmentRendered", html: true, spec: false },
  /**
   * #4 — Referans `Hareketi azalt` için Medya (`v7`) ve Erişilebilirlik (`x1`) sekmelerinde
   * **ayrı** anahtar tutuyor; `Text-to-speech` için de aynısı (`v8` / `x5`). Aynı adlı iki
   * kontrolün bağımsız durumu PROMPT §8 ile çelişir → tek anahtar, iki sekmede aynı değer.
   * Ağaçta `stateKey` ile taşınır.
   */
  { field: "sharedStateRowPairs.stateCount", html: 2, spec: 1 },
  /**
   * #5 — Referans profil kirli bayrağını `k.charAt(0) === 'p'` sezgisiyle kuruyor; bu kural Ses
   * işleme satırlarını (`p1`…`p9`) de profil alanı sayar ve Ses ve Video sekmesinde kaydet
   * şeridi çıkarır. Kirli alan listesi açıkça sayılır: `SETTINGS_DIRTY_PROFILE_KEYS`.
   */
  { field: "profileDirtyKeys.count", html: "prefix:p", spec: 8 },
  /**
   * #6 — Bildirim düzeyi iki farklı etiket kümesiyle görünüyor: 560 px pencere
   * `Tümü / Yalnızca önemli / Kapalı`, Ayarlar › Genel `Tüm bildirimler / Yalnız DM ve
   * bahsetmeler / Kapalı`. Metinler **birebir korunur**; ikisi de aynı `level` anahtarını yazar.
   */
  { field: "level.labelSets", html: 2, spec: 1 },
  /**
   * #7 — `SET_HITS` ölü hedef taşıyor: `['Gelişmiş bildirim ayarları', 'Bildirimler › Özet',
   * 'notif', 'ozet']` — `ozet` diye bir sekme yok. Arama indeksi statik dizi değil, `SETTINGS_TREE`
   * ağacından üretilir; böylece ölü hedef doğuramaz.
   */
  { field: "searchIndex.source", html: "SET_HITS", spec: "SETTINGS_TREE" },
  /**
   * #8 — Profil hero grubu ve Hakkında'nın ilk grubu etiketsiz (`['', '', [...]]`). Grup kabı
   * başlıksız da render edilebilmeli; `titleKey` bu yüzden opsiyonel.
   */
  { field: "group.titleOptional", html: true, spec: false },
  /**
   * #9 — `ne1` (`Yeni istisnalar için geçici sessize alma`) referansta `Aktif istisnalar`
   * grubunun içinde duruyor ama bir istisna değil, varsayılan. Kendi grubuna (`Varsayılanlar`)
   * alınır; **metin değişmez**. Ağaçta grup sayısını 58'de tutmak için satır `ownGroupTitleKey`
   * taşır — ağaç `SET` ile birebir kalır, çizim ayrı başlık kullanır.
   */
  { field: "exceptions.ne1Group", html: "Aktif istisnalar", spec: "Varsayılanlar" },
  /**
   * #10 — Bildirimler › Sesler grubunun notu `Ses ayarları bu cihaza kaydedilir.` diyor; K3
   * ise bildirim tercihlerini **tipli kolonlarda, sunucuda** saklıyor ve dört ses satırı da
   * `UserNotificationSettings` üzerinden geçiyor. Metin tasarımdan geldiği gibi korunur
   * (kalite çıtası: yeniden yazma yasak), davranış sunucu tarafındadır — yani ayar ikinci bir
   * cihazda da aynı gelir. Notu koda uydurmak, referans metniyle sözlüğü karşılaştıran
   * `settings-screen-copy.test.ts`'i tek taraflı kırmak olurdu.
   */
  { field: "sounds.storage", html: "device", spec: "server" },
  /**
   * #11 — K3'ün **tek** istisnası: `UserSettings.desktopShortcuts` bir `Json?` kolonudur.
   *
   * K3 bildirim tercihlerini tipli kolonlarda tutuyor çünkü "push'u açık olan kullanıcılar"
   * gerçek bir SQL filtresi. Kısayol atamalarının böyle bir sorgusu yok: "⌥H atamış
   * kullanıcılar" diye bir iş sorusu yok, cihaz başına bir kez okunan beş dizelik bir tercih
   * paketi var. Beş eyleme beş kolon açmak, altıncı eylem eklendiği gün bir migration daha
   * demekti.
   *
   * Kolonda **yalnız atamalar** durur. Çakışma her açılışta kabuğun gerçek kayıt denemesinden
   * okunur (K7); saklanmış bir çakışma, kullanıcı çakışan uygulamayı kaldırdıktan sonra da
   * kırmızı satır göstermeye devam ederdi.
   *
   * Ş0'a geri bildirilir: sözleşme katmanının sahibi bu istisnayı bilerek kabul etmiş olmalı.
   */
  { field: "desktopShortcuts.storage", html: "typed columns", spec: "Json?" },
  /**
   * #12 — Release kanalının üçüncü çipi `Canary`, veritabanının `ReleaseChannel` enum'unda ise
   * o değerin adı `UAT`.
   *
   * İkisi aynı akış: ürünün en erken, en riskli yayın hattı. Etiket referanstan **birebir**
   * korunur, saklanan değer kolonun bildiği addır (`lib/desktop/release-channel.ts`). Enum'a
   * dördüncü bir değer eklemek, hiçbir yayın hattının beslemediği bir kanalı var göstermek ve
   * şemayı — Ş0'ın dosyasını — bu şeritten değiştirmek olurdu.
   */
  { field: "releaseChannel.canary", html: "Canary", spec: "UAT" },
  /**
   * #13 — Referans kısayol satırı uzak WebView içinde `Kaydet / Sıfırla` çalıştırıyor. Tauri
   * capability sınırı ayrıcalıklı kısayol mutasyonunu yalnız ağsız Desktop Control penceresine
   * verir. Ana pencere salt-okunur durumu gösterir ve tek açık eylemle güvenilir yüzeye geçer.
   */
  {
    field: "desktopShortcuts.remoteActions",
    html: "Kaydet / Sıfırla",
    spec: "Masaüstü Denetimi'nde yönet",
  },
] as const;

/**
 * SPEC_DEVIATIONS #5 — kirli profil alanlarının **açık** listesi. Referansın `p` öneki sezgisi
 * `p1`…`p9` (Ses işleme) satırlarını da yakalıyordu; burada sayılan sekiz anahtar Hesabım ›
 * Profil sekmesindeki gerçek profil alanlarıdır.
 */
export const SETTINGS_DIRTY_PROFILE_KEYS = [
  "pn",
  "pu",
  "pz",
  "pbio",
  "pp",
  "ps",
  "pe",
  "px",
] as const;

export const SETTINGS_METRICS = {
  /** SPEC §1 — başlıktaki zilin açtığı 400 px popover. */
  panel: {
    width: 400,
    radius: 20,
    top: 50,
    right: 0,
    zIndex: 30,
    maxHeight: 640,
    /** `0 34px 76px -32px hsl(var(--shadow-color))` */
    shadow: { x: 0, y: 34, blur: 76, spread: -32, alpha: 1 },
    /** SPEC §10 — `<520px` tam genişlikli alt sayfaya döner (`globals.css`). */
    sheetBreakpoint: 520,
    /**
     * Ş13 — dar ekranda panelin görünüm alanından payı. Referansta karşılığı **yok**: 400 px
     * popover orada sabit bir kutu, üründe ise `min(400px, 100vw − 2×margin)`. Ürün kararı
     * olduğu için `parity.test.ts` bunu referansta aramaz; sözlükte durmasının nedeni ölçünün
     * iki bileşende (panel kutusu ve `max-height` hesabı) aynı sayıyı okuması.
     */
    viewportMargin: 12,

    header: {
      paddingTop: 16,
      paddingX: 18,
      paddingBottom: 13,
      gap: 10,
      borderBottomAlpha: 0.6,
      titleFontSize: 15.5,
      titleWeight: 600,
      /** Okunmamış sayacı — okunmamış kalmadığında yerini `Hepsi okundu` göstergesi alır. */
      countMinWidth: 20,
      countHeight: 19,
      countPaddingX: 6,
      countRadius: 7,
      countFontSize: 10.5,
      markAllFontSize: 11.5,
      markAllWeight: 600,
      allReadGap: 6,
      allReadIconSize: 13,
      gearSize: 28,
      gearRadius: 9,
      gearIconSize: 15,
    },

    tabs: {
      paddingY: 11,
      paddingX: 14,
      gap: 4,
      borderBottomAlpha: 0.5,
      tabHeight: 30,
      tabPaddingX: 11,
      tabRadius: 10,
      tabGap: 6,
      tabFontSize: 12,
      tabWeight: 600,
      pillMinWidth: 16,
      pillHeight: 16,
      pillPaddingX: 4,
      pillRadius: 5,
      pillFontSize: 9.5,
      /** Aktif sekmede pil zemini `hsl(0 0% 100%/.22)` — beyaz üstünde beyaz opaklığı. */
      activePillAlpha: 0.22,
    },

    list: {
      paddingTop: 8,
      paddingX: 10,
      paddingBottom: 12,
      groupLabelPaddingTop: 9,
      groupLabelPaddingX: 8,
      groupLabelPaddingBottom: 7,
      groupLabelGap: 9,
      groupLabelFontSize: 10,
      groupLabelWeight: 600,
      groupLabelTracking: 0.15,
      rowGap: 2,
    },

    row: {
      paddingY: 10,
      paddingX: 11,
      radius: 14,
      gap: 11,
      /** Okunmamış satırın zemini; okunmuşta şeffaf. */
      unreadSurfaceAlpha: 0.6,
      iconSize: 32,
      iconRadius: 11,
      iconFontSize: 13,
      titleFontSize: 12.5,
      titleLineHeight: 1.4,
      unreadWeight: 600,
      readWeight: 500,
      timeFontSize: 10.5,
      timeWeight: 500,
      subMarginTop: 4,
      subFontSize: 11.5,
      subLineHeight: 1.45,
      unreadDotSize: 7,
      unreadDotMarginTop: 12,
      /** Referans `soft()` — tür ikonunun zemini. */
      iconSurfaceAlpha: 0.14,
      /** Referans `gap:8px` — başlık ile saat arası. */
      titleTimeGap: 8,
    },

    empty: {
      paddingTop: 34,
      paddingX: 20,
      paddingBottom: 30,
      gap: 11,
      iconBox: 52,
      iconBoxRadius: 18,
      iconSize: 24,
      titleFontSize: 14,
      bodyMarginTop: 5,
      bodyFontSize: 12,
      bodyLineHeight: 1.5,
      /** Referans `soft()` — boş durum ikonunun zemini. */
      iconSurfaceAlpha: 0.14,
      /** Referans boş durum çerçevesi. */
      iconBorderAlpha: 0.3,
    },

    footer: {
      paddingY: 12,
      paddingX: 16,
      gap: 10,
      borderTopAlpha: 0.6,
      hintFontSize: 11,
      linkFontSize: 12,
      linkWeight: 600,
    },
  },

  /** SPEC §2 — panelin dişlisinin açtığı 560 px modal. Panel kapanır. */
  prefsDialog: {
    width: 560,
    radius: 22,
    /** `0 44px 96px -38px hsl(var(--shadow-color))` */
    shadow: { x: 0, y: 44, blur: 96, spread: -38, alpha: 1 },

    header: {
      paddingTop: 18,
      paddingX: 20,
      paddingBottom: 15,
      gap: 12,
      borderBottomAlpha: 0.6,
      bellBox: 38,
      bellRadius: 13,
      bellIconSize: 18,
      bellSurfaceAlpha: 0.15,
      titleFontSize: 17,
      titleWeight: 600,
      leadMarginTop: 5,
      leadFontSize: 12.5,
      leadLineHeight: 1.45,
      closeSize: 32,
      closeRadius: 11,
      closeIconSize: 16,
    },

    body: {
      paddingTop: 17,
      paddingX: 20,
      paddingBottom: 19,
      gap: 16,
      sectionLabelFontSize: 10,
      sectionLabelWeight: 600,
      sectionLabelTracking: 0.15,
      sectionLabelPaddingBottom: 10,
      sectionLabelGap: 9,
      /** Bölüm başlığının yanındaki hairline. */
      sectionRuleAlpha: 0.5,
      /** Başlık ile `Özel` / `Önerilen` pili arası. */
      titlePillGap: 8,
      /** `Özel` / `Önerilen` pilinin zemini. */
      pillSurfaceAlpha: 0.16,
    },

    /** İzin verilmişse bu şerit **hiç render edilmez**. */
    permissionStrip: {
      paddingY: 13,
      paddingX: 14,
      radius: 16,
      gap: 12,
      surfaceAlpha: 0.1,
      borderAlpha: 0.35,
      iconBox: 30,
      iconRadius: 10,
      iconSize: 15,
      iconSurfaceAlpha: 0.2,
      titleFontSize: 13,
      pillPaddingY: 2,
      pillPaddingX: 7,
      pillFontSize: 10,
      pillSurfaceAlpha: 0.22,
      bodyMarginTop: 6,
      bodyFontSize: 11.5,
      bodyLineHeight: 1.5,
      buttonRowMarginTop: 11,
      buttonGap: 7,
      buttonHeight: 31,
      buttonPaddingX: 13,
      buttonRadius: 10,
      buttonFontSize: 12,
    },

    levelCard: {
      gap: 5,
      paddingY: 11,
      paddingX: 12,
      radius: 14,
      innerGap: 11,
      selectedSurfaceAlpha: 0.09,
      selectedBorderAlpha: 0.45,
      radioSize: 18,
      radioBorderWidth: 2,
      radioDotSize: 8,
      radioMarginTop: 1,
      titleFontSize: 13,
      subMarginTop: 5,
      subFontSize: 11.5,
      subLineHeight: 1.5,
      pillPaddingY: 2,
      pillPaddingX: 7,
      pillFontSize: 9.5,
      /** Seçilmemiş kartın zemini (referans `soft()` ile aynı aile). */
      idleSurfaceAlpha: 0.4,
    },

    quickPref: {
      gap: 2,
      paddingY: 11,
      paddingX: 12,
      radius: 14,
      innerGap: 12,
      surfaceAlpha: 0.5,
      titleFontSize: 12.5,
      titleLineHeight: 1.25,
      subMarginTop: 5,
      subFontSize: 11.5,
      subLineHeight: 1.45,
      actionHeight: 29,
      actionPaddingX: 11,
      actionRadius: 10,
      actionFontSize: 11.5,
      switchWidth: 40,
      switchHeight: 23,
      switchKnob: 17,
      switchKnobInset: 3,
    },

    footer: {
      paddingY: 13,
      paddingX: 20,
      gap: 12,
      borderTopAlpha: 0.6,
      linkFontSize: 12.5,
      linkGap: 7,
      linkIconSize: 14,
      saveFontSize: 11.5,
      doneHeight: 33,
      donePaddingX: 16,
      doneRadius: 11,
      doneFontSize: 12.5,
      /** Çerçeveli (ikincil) düğmenin kenarı. */
      outlineBorderAlpha: 0.8,
      /** Referans `font:500 11.5px` — kayıt göstergesinin ağırlığı. */
      saveWeight: 500,
    },
  },

  /** SPEC §3 — kullanıcı barındaki dişlinin açtığı 308 px popover. */
  userMenu: {
    width: 308,
    radius: 20,
    left: 82,
    bottom: 14,
    zIndex: 36,
    /** `0 32px 72px -30px hsl(var(--shadow-color))` */
    shadow: { x: 0, y: 32, blur: 72, spread: -30, alpha: 1 },
    dividerAlpha: 0.55,

    sectionLabel: {
      fontSize: 10,
      weight: 600,
      tracking: 0.15,
      gap: 8,
      paddingBottom: 10,
      trailingFontSize: 10,
      trailingAlpha: 0.8,
    },

    /** K8 — anahtar `status = DND` yazar; süre çipi `statusExpiresAt` + `statusRestoreTo` kurar. */
    dnd: {
      sectionPaddingTop: 13,
      sectionPaddingX: 15,
      sectionPaddingBottom: 12,
      cardPaddingY: 10,
      cardPaddingX: 11,
      cardRadius: 14,
      cardGap: 11,
      iconSize: 32,
      iconRadius: 11,
      iconGlyphSize: 16,
      titleFontSize: 13,
      titleLineHeight: 1.2,
      subMarginTop: 4,
      subFontSize: 11,
      subLineHeight: 1.35,
      switchWidth: 40,
      switchHeight: 23,
      switchKnob: 17,
      switchKnobInset: 3,
      /** Dört çip **tek satırda** biter: 30 dk · 1 saat · 8 saat · Ben açana kadar. */
      chipRowMarginTop: 9,
      chipGap: 5,
      chipHeight: 27,
      chipPaddingX: 10,
      chipRadius: 9,
      chipFontSize: 11,
      chipSelectedSurfaceAlpha: 0.16,
      chipSelectedBorderAlpha: 0.45,
    },

    devices: {
      sectionPaddingY: 12,
      sectionPaddingX: 15,
      rowGap: 3,
      rowPaddingY: 9,
      rowPaddingX: 10,
      rowRadius: 12,
      rowGutter: 10,
      iconSize: 28,
      iconRadius: 9,
      iconGlyphSize: 15,
      labelFontSize: 9.5,
      labelWeight: 600,
      labelTracking: 0.13,
      valueMarginTop: 5,
      valueFontSize: 12.5,
      caretSize: 14,
      listMarginTop: 4,
      listMarginBottom: 2,
      listPadding: 5,
      listRadius: 12,
      listSurfaceAlpha: 0.55,
      listBorderAlpha: 0.5,
      optionPaddingY: 7,
      optionPaddingX: 9,
      optionRadius: 9,
      optionGap: 9,
      optionFontSize: 12,
      optionTickColumn: 14,
      optionTickSize: 13,
    },

    /** 14 segmentli giriş seviyesi ölçeri + `Test et`. */
    meter: {
      marginTop: 10,
      gap: 9,
      segmentCount: 14,
      segmentHeight: 5,
      segmentRadius: 2,
      segmentGap: 2,
      labelFontSize: 10.5,
      testFontSize: 10.5,
      testWeight: 600,
    },

    actions: {
      padding: 8,
      gap: 1,
      rowPadding: 10,
      rowRadius: 12,
      rowGap: 11,
      iconSize: 28,
      iconRadius: 9,
      iconGlyphSize: 15,
      labelFontSize: 13,
      labelLineHeight: 1.2,
      kbdPaddingY: 2,
      kbdPaddingX: 6,
      kbdRadius: 6,
      kbdFontSize: 10,
      /** Çıkış satırının ikon zemini `--danger` tonundadır. */
      dangerIconSurfaceAlpha: 0.14,
    },
  },

  /** SPEC §4 — 1180 × 800 ana pencere. */
  window: {
    width: 1180,
    height: 800,
    radius: 24,
    /** `0 50px 110px -40px hsl(var(--shadow-color))` */
    shadow: { x: 0, y: 50, blur: 110, spread: -40, alpha: 1 },
    /** Ortak modal kuralı: örtü kartın **kardeşi**, kart ayrı katmanda ortalanır. */
    backdropAlphaMin: 0.62,
    backdropAlphaMax: 0.72,
    /** SPEC §10 kırılımları. */
    breakpoints: {
      edgePadding: 1240,
      iconOnlyNav: 1024,
      horizontalNav: 860,
      fullScreen: 720,
    },
    edgePaddingSmall: 16,
    /** Referans `Ayarlar-referans.dc.html:741` — örtü katmanının `padding:26px` tabanı. */
    viewportPadding: 26,
  },

  /** SPEC §4.1 — 250 px sol navigasyon. */
  nav: {
    width: 250,
    /** SPEC §10 `<1024px` yalnız ikon. */
    iconOnlyWidth: 64,
    borderRightAlpha: 0.5,

    headerPaddingTop: 18,
    headerPaddingX: 16,
    headerPaddingBottom: 12,
    titleFontSize: 15,
    titleWeight: 600,

    searchMarginTop: 12,
    searchHeight: 34,
    searchPaddingY: 8,
    searchPaddingX: 10,
    searchRadius: 11,
    searchGap: 8,
    searchSurfaceAlpha: 0.75,
    searchIconSize: 14,
    searchFontSize: 12,
    searchActiveBorderAlpha: 0.5,
    searchClearSize: 18,
    searchClearRadius: 6,
    searchClearIconSize: 10,

    listPaddingTop: 4,
    listPaddingX: 10,
    listPaddingBottom: 12,

    groupLabelPaddingTop: 10,
    groupLabelPaddingX: 6,
    groupLabelPaddingBottom: 6,
    groupLabelFontSize: 9.5,
    groupLabelWeight: 600,
    groupLabelTracking: 0.15,
    groupLabelAlpha: 0.9,

    rowPaddingY: 8,
    rowPaddingX: 10,
    rowMarginBottom: 1,
    rowRadius: 10,
    rowGap: 10,
    rowIconSize: 16,
    rowIconOpacity: 0.9,
    rowFontSize: 13,
    rowLineHeight: 1.2,
    rowActiveWeight: 600,
    rowActiveSurfaceAlpha: 0.12,
    /** `Masaüstü` satırındaki `APP` etiketi — K11, yalnız Tauri çalışma zamanında. */
    tagPaddingY: 2,
    tagPaddingX: 6,
    tagRadius: 6,
    tagFontSize: 8.5,
    tagTracking: 0.06,

    footerPaddingY: 11,
    footerPaddingX: 12,
    footerGap: 10,
    footerBorderTopAlpha: 0.6,
    footerAvatarSize: 34,
    footerPresenceDot: 10,
    footerPresenceRing: 2.5,
    footerNameFontSize: 12.5,
    footerSubMarginTop: 4,
    footerSubFontSize: 10.5,
    footerLogoutSize: 28,
    footerLogoutRadius: 9,
    footerLogoutIconSize: 15,
  },

  /** SPEC §4.2 — içerik başlığı. */
  header: {
    paddingY: 14,
    paddingX: 24,
    gap: 12,
    borderBottomAlpha: 0.5,
    titleFontSize: 16,
    titleWeight: 600,
    titleLineHeight: 1.2,
    leadMarginTop: 4,
    leadFontSize: 11.5,
    leadWeight: 500,
    leadLineHeight: 1.35,
    /** SPEC_DEVIATIONS #3 — geometri kayıtlı, üründe çizilmiyor (K11). */
    runtimeSegment: {
      gap: 3,
      padding: 3,
      radius: 10,
      borderAlpha: 0.55,
      buttonHeight: 25,
      buttonPaddingX: 10,
      buttonRadius: 7,
      buttonFontSize: 10.5,
    },
    /** Üç durum: Kaydedildi · Kaydediliyor · Kaydedilemedi · yeniden dene. `aria-live="polite"`. */
    saveGap: 6,
    saveDotSize: 6,
    saveFontSize: 11,
    saveWeight: 500,
    closeSize: 31,
    closeRadius: 10,
    closeBorderAlpha: 0.7,
    closeIconSize: 15,
  },

  /** SPEC §4.3 — alt sekme şeridi. Bölüm tek sekmeliyse render edilmez (Hakkında). */
  tabs: {
    paddingX: 22,
    gap: 2,
    borderBottomAlpha: 0.5,
    tabHeight: 38,
    tabPaddingX: 12,
    tabFontSize: 12.5,
    tabActiveWeight: 600,
    tabWeight: 500,
    barHeight: 2,
    barInset: 8,
    barRadiusTop: 2,
  },

  /** SPEC §4.4 — içerik gövdesi. */
  body: {
    maxWidth: 720,
    paddingTop: 22,
    paddingX: 24,
    paddingBottom: 28,

    groupMarginBottom: 22,
    groupHeaderPaddingBottom: 9,
    groupHeaderGap: 10,
    groupTitleFontSize: 13,
    groupTitleWeight: 600,
    groupTitleLineHeight: 1.2,
    groupNoteFontSize: 11,
    groupNoteWeight: 500,
    groupNoteLineHeight: 1.4,
    /** Tuzak #6 — kapta `overflow:hidden` **yasak**; açılır menü kırpılır. */
    groupRadius: 16,
    groupBorderAlpha: 0.65,

    /** SPEC §4.6 — yükleniyor durumu, dört iskelet blok. */
    skeletonGap: 10,
    skeletonHeights: [96, 150, 112, 64],
    skeletonRadius: 16,
    skeletonSurfaceAlpha: 0.55,

    searchHeaderGap: 9,
    searchHeaderPaddingBottom: 12,
    searchHeaderFontSize: 10,
    searchHeaderTracking: 0.15,
    searchHitPaddingY: 12,
    searchHitPaddingX: 15,
    searchHitGap: 12,
    searchHitTitleFontSize: 12.5,
    searchHitTitleLineHeight: 1.25,
    searchHitPathMarginTop: 4,
    searchHitPathFontSize: 11,
    searchHitPathLineHeight: 1.4,
    searchHitChevronSize: 14,
    /** SPEC §4.6 — arama 250 ms debounce ile çalışır. */
    searchDebounceMs: 250,
  },

  /** SPEC §4.4 — satır. */
  row: {
    paddingY: 13,
    paddingX: 15,
    dividerWidth: 1,
    dividerAlpha: 0.45,
    headGap: 16,
    labelGap: 8,
    titleFontSize: 12.5,
    titleWeight: 600,
    titleLineHeight: 1.3,
    badgePaddingY: 2,
    badgePaddingX: 7,
    badgeFontSize: 9.5,
    badgeLineHeight: 1.5,
    subMarginTop: 4,
    subFontSize: 11.5,
    subLineHeight: 1.45,
    subMaxWidth: 400,
    /** Özel blok satırı kendi içinde kırpar; tek istisna bu. */
    customRadius: 15,
    /** SPEC §4.4 — bütün kontroller bu eksende biter. */
    controlAxisEnd: 1081,
  },

  /** SPEC §4.4 — on üç kontrol tipinin geometrisi. */
  controls: {
    toggle: {
      width: 38,
      height: 22,
      knob: 16,
      knobInset: 3,
      knobOnLeft: 20,
      /** Kilitli anahtar: `cursor:not-allowed` + bu opaklık + `Kilitli` pili. */
      lockedOpacity: 0.55,
      transitionSeconds: 0.18,
    },

    select: {
      width: 210,
      height: 34,
      paddingX: 11,
      radius: 10,
      gap: 8,
      borderAlpha: 0.75,
      hoverBorderAlpha: 0.5,
      valueFontSize: 12,
      valueWeight: 500,
      caretSize: 13,
      dotSize: 8,
      menuRadius: 12,
      menuMaxHeight: 222,
      menuPadding: 5,
      menuMinWidth: 210,
      menuZIndex: 20,
      /** `0 22px 48px -18px hsl(var(--shadow-color))` */
      menuShadow: { x: 0, y: 22, blur: 48, spread: -18, alpha: 1 },
      menuOffset: 38,
      optionPaddingY: 8,
      optionPaddingX: 9,
      optionRadius: 9,
      optionGap: 9,
      optionFontSize: 12,
      optionTickSize: 13,
      /**
       * SPEC §4.4 / tuzak #6 — tıklama anında düğmenin alt kenarı ile kaydırma alanının alt
       * kenarı karşılaştırılır; bu kadar yer yoksa menü **yukarı** açılır.
       */
      openDownThreshold: 236,
    },

    segment: {
      gap: 3,
      padding: 3,
      radius: 10,
      borderAlpha: 0.6,
      optionHeight: 26,
      optionPaddingX: 11,
      optionRadius: 7,
      optionFontSize: 11,
      optionWeight: 600,
    },

    slider: {
      blockWidth: 220,
      gap: 10,
      stepSize: 24,
      stepRadius: 8,
      stepBorderAlpha: 0.75,
      stepFontSize: 13,
      trackHeight: 4,
      trackRadius: 3,
      knob: 14,
      knobBorderWidth: 2,
      knobOffsetTop: -5,
      valueWidth: 46,
      valueFontSize: 11,
      valueWeight: 600,
    },

    input: {
      width: 260,
      radius: 10,
      borderAlpha: 0.75,
      paddingY: 9,
      paddingX: 11,
      fontSize: 12.5,
      weight: 500,
      lineHeight: 1.2,
      prefixPaddingLeft: 11,
    },

    textarea: {
      rows: 3,
      marginTop: 8,
      paddingY: 10,
      paddingX: 12,
      radius: 11,
      borderAlpha: 0.75,
      fontSize: 12.5,
      lineHeight: 1.55,
      counterMarginTop: 5,
      counterFontSize: 10.5,
      counterWeight: 500,
    },

    action: {
      gap: 6,
      height: 32,
      paddingX: 13,
      radius: 10,
      fontSize: 11.5,
      weight: 600,
      dangerSurfaceAlpha: 0.12,
      dangerBorderAlpha: 0.4,
      borderAlpha: 0.75,
    },

    nav: {
      height: 32,
      paddingX: 12,
      radius: 10,
      gap: 7,
      fontSize: 11.5,
      weight: 600,
      chevronSize: 12,
      borderAlpha: 0.75,
    },

    value: {
      maxWidth: 230,
      fontSize: 12,
      weight: 600,
      lineHeight: 1.35,
    },

    /** `snd` — anahtar + profil segmenti + seviye + `Önizle`, satırın altında ikinci sırada. */
    sound: {
      marginTop: 11,
      paddingTop: 11,
      borderTopAlpha: 0.45,
      gap: 11,
      profileOptionHeight: 24,
      profileOptionPaddingX: 10,
      profileOptionRadius: 7,
      profileOptionFontSize: 10.5,
      levelLabelFontSize: 10.5,
      stepSize: 22,
      stepRadius: 7,
      stepFontSize: 12,
      trackMinWidth: 50,
      trackHeight: 4,
      trackRadius: 3,
      knob: 14,
      knobBorderWidth: 2,
      knobOffsetTop: -5,
      valueWidth: 26,
      valueFontSize: 11,
      previewHeight: 28,
      previewPaddingX: 11,
      previewRadius: 9,
      previewGap: 6,
      previewIconSize: 11,
      previewFontSize: 11,
    },
  },

  /** SPEC §5.1 — satır içi açılan riskli bloklar. Aynı anda **tek** blok (tuzak #12). */
  riskyBlock: {
    marginTop: 13,
    paddingTop: 13,
    borderTopAlpha: 0.5,
    columnGap: 10,
    fieldLabelFontSize: 10.5,
    fieldLabelWeight: 600,
    fieldLabelTracking: 0.1,
    fieldMarginTop: 6,
    fieldPaddingY: 9,
    fieldPaddingX: 11,
    fieldRadius: 10,
    fieldFontSize: 12.5,
    helpFontSize: 11,
    helpLineHeight: 1.45,
    buttonGap: 9,
    buttonHeight: 32,
    buttonPaddingX: 13,
    buttonRadius: 10,
  },

  /** SPEC §4.5 — profil alanları kirlendiğinde çıkan alt şerit. */
  saveBar: {
    paddingY: 12,
    paddingX: 24,
    gap: 12,
    borderTopAlpha: 0.6,
    textFontSize: 12,
    textWeight: 500,
    textLineHeight: 1.4,
    resetHeight: 32,
    resetPaddingX: 13,
    saveHeight: 32,
    savePaddingX: 15,
    saveRadius: 10,
    saveFontSize: 11.5,
  },

  /** 20 özel bloğun geometrisi. */
  blocks: {
    /** SPEC §5.1 — Profil hero kartı. Ad ve kullanıcı adı yazdıkça canlı güncellenir. */
    hero: {
      bannerHeight: 132,
      bannerFadeHeight: 64,
      bannerButtonTop: 11,
      bannerButtonRight: 12,
      bannerButtonGap: 6,
      bannerButtonHeight: 29,
      bannerButtonPaddingX: 11,
      bannerButtonRadius: 9,
      bannerRemoveSize: 29,
      avatarRowMarginTop: -42,
      avatarRowPaddingX: 18,
      avatarRowGap: 15,
      avatarSize: 80,
      avatarRing: 5,
      /** `0 10px 26px -12px hsl(var(--shadow-color))` */
      avatarShadow: { x: 0, y: 10, blur: 26, spread: -12, alpha: 1 },
      statusDotSize: 17,
      statusDotRing: 3.5,
      statusDotOffset: 2,
      cameraButtonSize: 28,
      cameraButtonRing: 3,
      nameFontSize: 18,
      nameWeight: 600,
      handleMarginTop: 6,
      handleFontSize: 12,
      handleGap: 8,
      handleSeparatorSize: 3,
      statusPillPaddingY: 6,
      statusPillPaddingX: 11,
      statusPillFontSize: 11,
      statusPillDotSize: 7,
      statusPillSurfaceAlpha: 0.15,
      viewProfileHeight: 32,
      viewProfilePaddingX: 13,
      viewProfileRadius: 10,
      viewProfileFontSize: 11.5,
    },

    /** SPEC §5.1 — `Bağlı hesaplar`; dördü de `disabled` + `TODO(api):` (K5). */
    connections: { rowPaddingY: 12, rowPaddingX: 15, rowGap: 12, iconSize: 30, iconRadius: 10 },

    /** K5 — `Son güvenlik etkinlikleri`, üç satır, renk noktalı. */
    securityEvents: { rowPaddingY: 11, rowPaddingX: 15, rowGap: 12, dotSize: 8 },

    /** SPEC §5.1 — `Bu cihaz` pili olan satırda kapat düğmesi **yok** (tuzak #13). */
    sessions: {
      rowPaddingY: 11,
      rowPaddingX: 15,
      rowGap: 12,
      iconSize: 30,
      iconRadius: 10,
      currentSurfaceAlpha: 0.06,
      closeSize: 30,
      closeRadius: 9,
    },

    /** SPEC §5.1 — beş kategori, her biri dört kolon. */
    badgeGrid: { columns: 4, cellPadding: 13, iconSize: 34, iconRadius: 12, starSize: 12 },

    /** K13 — satır motoruna sığmayan iki parçadan biri. */
    micMeter: { labelWidth: 96, segmentCount: 14, segmentHeight: 5, segmentGap: 2, radius: 2 },

    /** K13 — ikincisi. `Önizleme yalnızca bu pencerede görünür, kimseye gönderilmez.` */
    cameraPreview: { width: 220, aspectWidth: 16, aspectHeight: 9, radius: 12, borderAlpha: 0.7 },

    /** SPEC §5.3 — dört basit tema kartı. */
    simpleThemes: { columns: 4, previewHeight: 62, radius: 12, selectedBorderWidth: 2 },

    /** K6 — 23 tema, üç kolon; kimlik ve renk korunur, yalnız ad atanır. */
    themeGrid: { columns: 3, swatchSize: 18, swatchRadius: 6, rowPaddingY: 10, rowPaddingX: 12 },

    /** SPEC §5.3 — font, boyut ve kompakt seçimi anında yansır. */
    messagePreview: { paddingY: 14, paddingX: 15, gap: 12, avatarSize: 36 },

    /** SPEC §5.3 — yedi kutu (Whispr, Wave 5…0). */
    appIconGrid: { columns: 7, tileSize: 56, tileRadius: 14, selectedBorderWidth: 2 },

    /**
     * SPEC §5.4 — `Şu anki durum` üç kutulu özet.
     *
     * Dolgu referansın `padding:14px 15px` satırından; ilk kayıt satır dolgusunu (`13/15`)
     * yankılıyordu ve kutu bir piksel dar çiziliyordu (Ş9 raporu §"Ölçü düzeltmeleri").
     */
    notifSummary: {
      columns: 3,
      cellPaddingY: 14,
      cellPaddingX: 15,
      valueFontSize: 18,
      valueWeight: 600,
      valueLineHeight: 1,
      labelMarginTop: 6,
      labelFontSize: 11,
      labelLineHeight: 1.4,
    },

    /** K4 — üç tablonun birleşimi; yazma kendi kaynağına gider. */
    exceptions: {
      rowPaddingY: 11,
      rowPaddingX: 15,
      rowGap: 12,
      glyphSize: 30,
      glyphRadius: 10,
      glyphFontSize: 11,
      glyphSurfaceAlpha: 0.14,
      nameFontSize: 12.5,
      nameLineHeight: 1.2,
      levelMarginTop: 4,
      levelFontSize: 11,
      levelLineHeight: 1.4,
      untilPillPaddingY: 3,
      untilPillPaddingX: 8,
      untilPillFontSize: 10,
      untilPillLineHeight: 1.4,
      editHeight: 29,
      editPaddingX: 11,
      editRadius: 9,
      editFontSize: 11,
      editBorderAlpha: 0.75,
      removeSize: 29,
      removeRadius: 9,
      removeBorderAlpha: 0.7,
      removeIconSize: 13,
      removeHoverSurfaceAlpha: 0.12,
    },

    /** K7 — beş atama; kayıt hatası **çakışma** olarak raporlanır. */
    shortcuts: {
      rowPaddingY: 11,
      rowPaddingX: 15,
      rowGap: 12,
      capsuleHeight: 26,
      capsulePaddingX: 9,
      capsuleRadius: 8,
      capsuleFontSize: 11,
      conflictSurfaceAlpha: 0.05,
      conflictCapsuleSurfaceAlpha: 0.1,
      conflictCapsuleBorderAlpha: 0.35,
      rebindHeight: 29,
      rebindPaddingX: 11,
      rebindRadius: 9,
      /** Ş10 — satırın kendi tipografisi ve tuş kapsüllerinin arası. */
      labelFontSize: 12,
      labelWeight: 500,
      labelLineHeight: 1.3,
      errorFontSize: 10.5,
      errorWeight: 500,
      capsuleWeight: 600,
      capsuleMinWidth: 24,
      capsuleBorderAlpha: 0.7,
      keysGap: 4,
      rebindIconSize: 13,
    },

    /** SPEC §5.5 — beş izin satırı; durum noktayla **ve** pille yazılır. */
    permissions: {
      rowPaddingY: 12,
      rowPaddingX: 15,
      rowGap: 12,
      dotSize: 8,
      iconSize: 30,
      /** Ş10 — pil, yardım metni ve duruma göre gelen düğmeler. */
      labelGap: 8,
      labelFontSize: 12.5,
      labelWeight: 600,
      badgePaddingY: 2,
      badgePaddingX: 7,
      badgeFontSize: 9.5,
      badgeWeight: 600,
      badgeSurfaceAlpha: 0.16,
      helpMarginTop: 4,
      helpFontSize: 11,
      helpLineHeight: 1.45,
      helpMaxWidth: 330,
      buttonGap: 6,
      buttonHeight: 30,
      buttonPaddingX: 11,
      buttonRadius: 10,
      buttonFontSize: 11,
      buttonWeight: 600,
    },

    /** SPEC §5.5 — iki kolonlu on satırlık durum ızgarası. */
    diagnostics: {
      columns: 2,
      rows: 10,
      cellPaddingY: 10,
      cellPaddingX: 14,
      /** Ş10 — hücrenin noktası ve iki metni. */
      cellGap: 9,
      dotSize: 6,
      labelFontSize: 11.5,
      labelWeight: 500,
      valueFontSize: 11,
      valueWeight: 600,
    },

    /** SPEC §5.6 — Whispr kartı, dört bağlantı. */
    about: {
      logoSize: 56,
      logoRadius: 18,
      paddingY: 18,
      paddingX: 18,
      bodyMaxWidth: 400,
      /** Ş10 — logo ile gövdenin arası, başlık ve dört bağlantı. */
      gap: 16,
      logoFontSize: 21,
      logoWeight: 600,
      titleFontSize: 16,
      titleWeight: 600,
      bodyMarginTop: 6,
      bodyFontSize: 12,
      bodyLineHeight: 1.55,
      linksMarginTop: 12,
      linksGap: 14,
      linkFontSize: 11.5,
      linkWeight: 600,
    },

    /** SPEC §5.6 — iki kolonlu sekiz satır. */
    versionGrid: {
      columns: 2,
      rows: 8,
      cellPaddingY: 10,
      cellPaddingX: 14,
      /** Ş10 — etiket solda, değer sağda. */
      cellGap: 9,
      labelFontSize: 11.5,
      labelWeight: 500,
      valueFontSize: 11.5,
      valueWeight: 600,
    },

    /**
     * SPEC §5.6 — üç kart.
     *
     * Ş10 notu: referans (`Ayarlar-referans.dc.html`) bu üç kartı **satır** olarak çiziyor
     * (`display:flex;gap:13px;padding:13px 15px;border-top`), üç kolonlu bir ızgara olarak
     * değil. `columns: 3` bu yüzden bir ızgara değil, kart **sayısıdır**; çizim satır ölçülerini
     * kullanır. Otorite sırası referansın inline `style`'ını SPEC'in üstüne koyuyor.
     */
    whatsNew: {
      columns: 3,
      cardPaddingY: 14,
      cardPaddingX: 14,
      cardRadius: 14,
      rowPaddingY: 13,
      rowPaddingX: 15,
      rowGap: 13,
      tagPaddingY: 3,
      tagPaddingX: 9,
      tagFontSize: 9.5,
      tagWeight: 600,
      tagSurfaceAlpha: 0.16,
      titleFontSize: 12.5,
      titleWeight: 600,
      bodyMarginTop: 5,
      bodyFontSize: 11.5,
      bodyLineHeight: 1.5,
    },

    /** SPEC §5.6 — dört satır, rol pilleriyle. */
    contributors: {
      rowPaddingY: 11,
      rowPaddingX: 15,
      rowGap: 12,
      avatarSize: 30,
      /** Ş10 — ad solda, rol pili sağda. */
      nameFontSize: 12,
      nameWeight: 600,
      rolePaddingY: 3,
      rolePaddingX: 8,
      roleFontSize: 10,
      roleWeight: 600,
    },

    /** SPEC §5.1 — 2FA bloğundaki QR. */
    twoFactorQr: { size: 104, radius: 12 },
  },

  /** SPEC-ANA-SAYFA §1 — geçişler. Referanstaki 850 ms sabit gecikme taklit edilmez (tuzak #14). */
  motion: {
    transitionSeconds: 0.16,
    searchBorderSeconds: 0.18,
    switchSeconds: 0.18,
  },
} as const;

export type SettingsMetrics = typeof SETTINGS_METRICS;
