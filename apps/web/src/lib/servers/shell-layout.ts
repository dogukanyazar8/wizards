import { SERVER_METRICS } from "./metrics";

/**
 * Sunucu ekranının küçük ekran kırılımları — `SPEC-SUNUCU.md` §11.
 *
 * SPEC dört eşik veriyor ve dördü de `SERVER_METRICS.layout` altında yaşıyor; bu modül **ikinci
 * bir sayı tanımlamaz**, yalnız eşikleri okuyup kabuğun okuyabileceği bir karara çevirir:
 *
 * | Genişlik | Karar |
 * | --- | --- |
 * | `< 1400` | Sağ panel akıştan çıkar, içeriğin **üstüne biner** (Ş5 uyguladı) |
 * | `< 1200` | Gezinme paneli daraltılır; **kanal kenar çubuğu korunur** |
 * | `< 1024` | Sunucu ayarları ve sunucu oluşturma tek kolona düşer (CSS, aşağıda) |
 * | `< 960` | Kanal kenar çubuğu drawer'a taşınır |
 *
 * **Ölçek değil, kompozisyon.** Daha büyük ekranda kolon sayısı artmaz; `lib/home/scale.ts`
 * kök font boyutunu büyütür ve aynı kompozisyon büyür. Bu yüzden eşikler `rem` değil **görünüm
 * alanı pikselidir**: `rem` olsalardı 4K'da (kök 32px) `1200rem-eşdeğeri` 2400px'e kayar ve
 * kompozisyon hiç kırılmadan büyür/kırılırdı. Aynı gerekçe `lib/home/layout.ts`'te de yazılı.
 *
 * **Gezinme paneli "daraltılır" ne demek (K1 ile çelişmeden).** `00-ortak-baglam` §1 gezinme
 * panelini (280) **dokunulmaz** ilan ediyor; §11 ise 1200'ün altında "yalnızca ikonlar, 74px"
 * istiyor. İkisi ancak tek şekilde uyuşur: panelin **kendisi** yeniden çizilmez, kabuk onu
 * kolondan düşürür ve geriye zaten ikon-only ve zaten 74px olan **sunucu rayı** kalır. Panelin
 * içeriği kaybolmaz — `MobileDrawerTrigger` onu drawer'da açar. Sapma raporda kayıtlı.
 */

export type ServerShellLayout = {
  /** Gezinme paneli (280) kolondan düşer; ray + kanal kenar çubuğu kalır. */
  readonly navPanelCollapsed: boolean;
  /** Sağ panel akıştan çıkıp içeriğin üstüne biner. */
  readonly rightPanelOverlay: boolean;
  /** Kanal kenar çubuğu (252) kolondan düşer ve drawer'a taşınır. */
  readonly sidebarInDrawer: boolean;
};

/**
 * Genişlik ölçülemediğinde (SSR anlık görüntüsü, `0`, `NaN`) **en geniş** kompozisyon seçilir.
 * Sebep ölçülmüş bir hata: dar varsayıp ilk boyayı drawer'lı çizmek, geniş ekranda kabuğu bir
 * kare boyunca kolonsuz gösterir ve hidrasyondan sonra üç kolon birden içeri "zıplar".
 */
export function selectServerShellLayout(width: number): ServerShellLayout {
  const { layout } = SERVER_METRICS;

  if (!Number.isFinite(width) || width <= 0) {
    return { navPanelCollapsed: false, rightPanelOverlay: false, sidebarInDrawer: false };
  }

  return {
    navPanelCollapsed: width < layout.navPanelCollapseBelow,
    rightPanelOverlay: width < layout.rightPanelOverlayBelow,
    sidebarInDrawer: width < layout.sidebarDrawerBelow,
  };
}

/**
 * Sağ panel **ekranda** açık mı? — SPEC-SUNUCU §11.
 *
 * İki ayrı açıklık var, çünkü panelin iki ayrı hâli var:
 *
 * - Kolon kipinde (`>=rightPanelOverlayBelow`) panel yer kaplar; açıklığı kullanıcının kalıcı
 *   tercihidir (`memberPanelCollapsed`).
 * - Katman kipinde panel akıştan çıkıp içeriğin **üstüne** biner. Aynı kalıcı tercihi orada da
 *   uygulamak, 1280 px'lik bir pencerede besteciyi ve mesaj metnini kalıcı olarak örtüyordu —
 *   ölçülen kırık buydu. Katman kipi kendi geçici bayrağını okur ve varsayılanı **kapalı**dır:
 *   dar ekranda panel yalnız istendiğinde gelir, gelince de kapatılabilir.
 *
 * Kural burada duruyor ki üç çağıran (`chat-area`, `server-member-panel`, `voice-channel-view`)
 * aynı cevabı versin; üç yerde tekrarlanan bir koşul, birinde unutulan bir güncelleme demekti.
 */
export function selectRightPanelOpen(input: {
  readonly collapsed: boolean;
  readonly overlay: boolean;
  readonly overlayOpen: boolean;
}): boolean {
  return input.overlay ? input.overlayOpen : !input.collapsed;
}

/** Ayarlar kaplaması ve sunucu oluşturma penceresi bu tutamağı taşır. */
export const SERVER_SINGLE_COLUMN_ATTRIBUTE = "data-server-single-column";

/**
 * §11'in son satırının CSS karşılığı: sunucu ayarları ve sunucu oluşturma `< 1024`'te tek kolona
 * düşer ve **önizleme/gezinme kolonu forma üstten eklenir**.
 *
 * Neden CSS, neden Tailwind'in `lg:`'i değil:
 *
 * - Kırılım CSS'te seçilirse SSR ile istemci aynı şeyi çizer; `useSyncExternalStore`ün sunucu
 *   anlık görüntüsü (1280) ile gerçek genişlik farklı olduğunda ilk boya yanlış kolonda çıkardı.
 * - Tailwind v4'ün `lg:`'i `64rem`'dir, yani **kök font boyutuna bağlıdır**. Kabuk 2K'da kökü
 *   24px'e çıkardığı an `lg:` 1536 CSS px'e kayar. §11'in 1024'ü bir görünüm alanı sayısıdır;
 *   sözlükten gelen `px` medya sorgusu onu ölçekten bağımsız tutar.
 *
 * Sıra `order` ile veriliyor: dar ekranda önizleme/gezinme **üstte**, form altta.
 */
export function buildServerSingleColumnCss(): string {
  const { modalSingleColumnBelow } = SERVER_METRICS.layout;

  return `
@media (max-width:${modalSingleColumnBelow - 1}px){
  [${SERVER_SINGLE_COLUMN_ATTRIBUTE}="shell"]{flex-direction:column}
  [${SERVER_SINGLE_COLUMN_ATTRIBUTE}="shell"] > [${SERVER_SINGLE_COLUMN_ATTRIBUTE}="aside"]{order:-1;width:100%;height:auto;flex:none;border-right-width:0;border-bottom-width:var(--server-single-column-hairline)}
  [${SERVER_SINGLE_COLUMN_ATTRIBUTE}="shell"] > [${SERVER_SINGLE_COLUMN_ATTRIBUTE}="main"]{order:0;min-height:0}
  [${SERVER_SINGLE_COLUMN_ATTRIBUTE}="grid"]{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  [${SERVER_SINGLE_COLUMN_ATTRIBUTE}="grid"] > [${SERVER_SINGLE_COLUMN_ATTRIBUTE}="aside"]{order:-1;border-left-width:0;border-bottom-width:var(--server-single-column-hairline)}
  [${SERVER_SINGLE_COLUMN_ATTRIBUTE}="grid"] > [${SERVER_SINGLE_COLUMN_ATTRIBUTE}="main"]{order:0}
}`.trim();
}
