import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { maskComments } from "@/lib/home/copy-audit";

import { SERVER_METRICS } from "./metrics";
import {
  SERVER_SINGLE_COLUMN_ATTRIBUTE,
  buildServerSingleColumnCss,
  selectRightPanelOpen,
  selectServerShellLayout,
} from "./shell-layout";

/**
 * SPEC-SUNUCU §11 — dört kırılımın tamamı. Eşikler sözlükten okunur; test ikinci bir sayı
 * yazmaz, yalnız **sınırın iki yanını** kontrol eder: kırılım eşiğin kendisinde değil,
 * eşiğin **altında** açılır (`<1200`, `<=1199`).
 */
const { layout } = SERVER_METRICS;

describe("sunucu kabuğu kırılımları (§11)", () => {
  it("dört eşiği sözlükten okur ve SPEC sayılarını taşır", () => {
    assert.equal(layout.rightPanelOverlayBelow, 1400);
    assert.equal(layout.navPanelCollapseBelow, 1200);
    assert.equal(layout.modalSingleColumnBelow, 1024);
    assert.equal(layout.sidebarDrawerBelow, 960);
  });

  it("1360×920 asgari kabuğunda hiçbir kırılım açık değil", () => {
    assert.deepEqual(selectServerShellLayout(1360), {
      navPanelCollapsed: false,
      rightPanelOverlay: true,
      sidebarInDrawer: false,
    });
  });

  it("dört hedef çözünürlükte kompozisyon bölünmez", () => {
    for (const width of [1360, 1920, 2560, 3840]) {
      const result = selectServerShellLayout(width);

      assert.equal(result.navPanelCollapsed, false, `${width}: panel daralmamalı`);
      assert.equal(result.sidebarInDrawer, false, `${width}: kenar çubuğu kolonda kalmalı`);
    }

    // 1360 tek istisna: sağ panel 1400'ün altında zaten katman olur (§11 ilk satırı).
    assert.equal(selectServerShellLayout(1360).rightPanelOverlay, true);
    assert.equal(selectServerShellLayout(1920).rightPanelOverlay, false);
  });

  it("sağ panel 1400'ün altında katmana geçer, 1400'de geçmez", () => {
    assert.equal(selectServerShellLayout(1399).rightPanelOverlay, true);
    assert.equal(selectServerShellLayout(1400).rightPanelOverlay, false);
  });

  it("gezinme paneli 1200'ün altında düşer, kanal kenar çubuğu kalır", () => {
    const below = selectServerShellLayout(1199);

    assert.equal(below.navPanelCollapsed, true);
    assert.equal(below.sidebarInDrawer, false);
    assert.equal(selectServerShellLayout(1200).navPanelCollapsed, false);
  });

  it("kanal kenar çubuğu 960'ın altında drawer'a taşınır", () => {
    assert.equal(selectServerShellLayout(959).sidebarInDrawer, true);
    assert.equal(selectServerShellLayout(960).sidebarInDrawer, false);
    // 960'ın altında panel de zaten düşmüştür — kademeler birbirini kapsar.
    assert.equal(selectServerShellLayout(959).navPanelCollapsed, true);
  });

  it("ölçülemeyen genişlikte en geniş kompozisyonu seçer", () => {
    for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.deepEqual(
        selectServerShellLayout(width),
        { navPanelCollapsed: false, rightPanelOverlay: false, sidebarInDrawer: false },
        String(width),
      );
    }
  });
});

describe("tek kolon kırılımı (§11 son satırı)", () => {
  const css = buildServerSingleColumnCss();

  it("eşiği sözlükten alır ve px medya sorgusu yazar", () => {
    assert.match(
      css,
      new RegExp(`@media \\(max-width:${layout.modalSingleColumnBelow - 1}px\\)`, "u"),
    );
    // `rem` bir eşik olamaz: kabuk kökü 2K'da 24px'e çıkarır ve 64rem 1536 CSS px'e kayar.
    assert.doesNotMatch(css, /max-width:[\d.]+rem/u);
  });

  it("önizleme/gezinme kolonunu forma üstten ekler", () => {
    // §11: "önizleme kolonu forma **üstten** eklenir".
    assert.match(css, /order:-1/u);
    assert.match(css, new RegExp(`\\[${SERVER_SINGLE_COLUMN_ATTRIBUTE}="aside"\\]`, "u"));
    assert.match(css, new RegExp(`\\[${SERVER_SINGLE_COLUMN_ATTRIBUTE}="main"\\]`, "u"));
  });

  it("iki kabuk biçimini de kapsar: flex (ayarlar) ve grid (sunucu oluştur)", () => {
    assert.match(
      css,
      new RegExp(`\\[${SERVER_SINGLE_COLUMN_ATTRIBUTE}="shell"\\]\\{flex-direction:column\\}`, "u"),
    );
    assert.match(
      css,
      new RegExp(
        `\\[${SERVER_SINGLE_COLUMN_ATTRIBUTE}="grid"\\]\\{grid-template-columns:minmax\\(0,1fr\\)`,
        "u",
      ),
    );
  });

  it("hiçbir renk taşımaz", () => {
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/u);
    assert.doesNotMatch(css, /hsla?\(|rgba?\(|oklch\(/u);
  });
});

/**
 * Kabuğun kuralı gerçekten tükettiğinin denetimi.
 *
 * `wizards-shell.tsx` `useQuery` · `useAppStore` · soket aboneliği · `framer-motion` üstüne
 * kurulu; `renderToStaticMarkup` onu bütün olarak süremez. Ölçülebilen şey dosyanın
 * **sözleşmesi**: kararı bu modülden okuyor mu, üç sütun kararını üç ayrı prop olarak mı
 * veriyor. Gerçek kolon davranışı `e2e/specs/design/server-parity.spec.ts` → "§11 · kırılımlar".
 */
describe("kabuk kırılımı tüketiyor (§11)", () => {
  const shell = readFileSync(
    new URL("../../components/shell/wizards-shell.tsx", import.meta.url),
    "utf8",
  );

  it("kararı bu modülden okur, kendi eşiğini yazmaz", () => {
    assert.match(shell, /selectServerShellLayout\(responsiveLayout\.viewportWidth\)/u);

    // Üç eşiğin sayısı kabuğun **kodunda** geçmez; hepsi `SERVER_METRICS.layout`ta. Yorumlar
    // maskeleniyor: §11'i anlatan açıklamalar sayıyı yazmak zorunda ve bu bir sızıntı değil.
    const code = maskComments(shell);

    for (const threshold of ["1400", "1200", "960"]) {
      assert.equal(
        new RegExp(`\\b${threshold}\\b`, "u").test(code),
        false,
        `kabuk ${threshold} eşiğini kendi yazıyor`,
      );
    }
  });

  it("üç sütun kararını ayrı ayrı verir", () => {
    assert.match(shell, /navPanelHidden=\{navCollapsed\}/u);
    assert.match(shell, /thirdColumnHidden=\{sidebarInDrawer\}/u);
    assert.match(shell, /navCollapsed=\{desktopColumnsHidden\}/u);
  });

  it("sunucu rotasında sütunun tamamını gizlemez", () => {
    // §11 hiçbir eşikte rayı kaldırmıyor: `<960`'ta bile "yalnızca ikonlar, 74px" kalır.
    assert.match(shell, /const desktopColumnsHidden = navCollapsed && !isServerColumnRoute;/u);
  });
});

describe("sağ panelin açıklığı (§11)", () => {
  it("kolon kipinde kalıcı tercihi okur", () => {
    assert.equal(
      selectRightPanelOpen({ collapsed: false, overlay: false, overlayOpen: false }),
      true,
    );
    assert.equal(
      selectRightPanelOpen({ collapsed: true, overlay: false, overlayOpen: true }),
      false,
    );
  });

  it("katman kipinde kalıcı tercih panelin üstüne binmez", () => {
    // Ölçülen kırık: 1280 px'te tercih "açık" olduğu için panel besteciyi kalıcı örtüyordu.
    assert.equal(
      selectRightPanelOpen({ collapsed: false, overlay: true, overlayOpen: false }),
      false,
    );
  });

  it("katman kipinde panel yalnız istendiğinde açılır", () => {
    assert.equal(selectRightPanelOpen({ collapsed: true, overlay: true, overlayOpen: true }), true);
  });

  it("1360'ta katman kipindedir, yani varsayılan kapalıdır", () => {
    const { rightPanelOverlay } = selectServerShellLayout(1360);

    assert.equal(rightPanelOverlay, true);
    assert.equal(
      selectRightPanelOpen({ collapsed: false, overlay: rightPanelOverlay, overlayOpen: false }),
      false,
    );
  });
});
