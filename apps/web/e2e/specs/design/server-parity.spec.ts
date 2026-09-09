import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EServerRoute, setE2EUserTheme } from "../../helpers/db";
import {
  applyParityTheme,
  expectNoClippedText,
  expectNoOverflow,
  waitForRootFontSize,
  type ParityTheme,
} from "../../helpers/design-parity";
import { gotoAppRoute } from "../../helpers/navigation";

/**
 * Sunucu ekranı parity matrisi — SPEC-SUNUCU §11, PLAN §8.
 *
 * **Ş14 kapanışı.** Matris artık gerçek: Ş4 · Ş5 · Ş8 · Ş9 · Ş10 · Ş11 · Ş12 · Ş13 yüzeylerinin
 * hepsi dört çözünürlük × iki temada ölçülüyor, ayrıca dokuz ayar bölümü tek tek geziliyor.
 *
 * **Ş6 ve Ş7 satırları da açıldı.** İki şerit Ş14'ten sonra koştu: metin kanalı çerçevesi
 * (`ServerChannelHeader`, `server-text-channel`) ve ses kanalı yüzeyi (`ServerVoiceHeader`,
 * `server-voice-channel`) artık DOM'da. `test.fixme` kalmadı; matris **tam**.
 *
 * Ana Sayfa ve Mesajlar matrisleriyle **aynı** yardımcıları kullanır
 * (`e2e/helpers/design-parity.ts`); ikinci bir "taşma yok" tanımı üretilmez.
 */

/**
 * PLAN §8'in dört çözünürlüğü. Kök font boyutu SPEC-ANA-SAYFA §8.1 adım tablosundan gelir —
 * ×1.15 adımının kökü 18px'tir (16 × 1.125), etiketteki 1.15 çarpanı değil.
 */
const VIEWPORTS = [
  { expectedRootFontSize: 16, expectedScale: 1, height: 920, name: "base", width: 1360 },
  { expectedRootFontSize: 18, expectedScale: 1.15, height: 1080, name: "fhd", width: 1920 },
  { expectedRootFontSize: 24, expectedScale: 1.5, height: 1440, name: "qhd", width: 2560 },
  { expectedRootFontSize: 32, expectedScale: 2, height: 2160, name: "uhd", width: 3840 },
] as const;

const THEMES: readonly ParityTheme[] = ["theme-light", "theme-dark"];

/** SPEC §1 — kanal kenar çubuğu 252, `rem` olduğu için ölçekle büyür. */
const CHANNEL_SIDEBAR_WIDTH = 252;

/** SPEC §4 — sağ panel 326; o da `rem`. */
const RIGHT_PANEL_WIDTH = 326;

/** SPEC §11 — bu genişliğin altında panel içeriğin üstüne binen katmandır. */
const RIGHT_PANEL_OVERLAY_BELOW = 1400;

/**
 * Ölçülen yüzeyler. `testId` üründeki gerçek tutamaktır — Ş0 iskeletindeki tahmin adlar
 * (`server-channel-modal`, `server-create-modal`) hiç doğmadı; şeritler kendi adlarını koydu.
 *
 * `open` yüzeyi ekrana getirir. Her yüzey **kendi tetikleyicisinden** açılıyor: doğrudan bir
 * store çağrısı, tetikleyicinin gerçekten bağlı olup olmadığını ölçmezdi.
 */
const SURFACES = [
  {
    lane: "Ş6",
    name: "metin kanalı",
    async open() {
      // Metin kanalı rotanın kendisi; açılacak bir tetikleyici yok.
    },
    testId: "server-text-channel",
  },
  {
    lane: "Ş8",
    name: "kanal penceresi",
    async open(page: Page) {
      await page.getByTestId("server-header-button").click();
      await page.getByTestId("server-menu-createChannel").click();
    },
    testId: "channel-form",
  },
  {
    lane: "Ş9",
    name: "davet penceresi",
    async open(page: Page) {
      await page.getByTestId("server-header-button").click();
      await page.getByTestId("server-menu-invite").click();
    },
    testId: "server-invite-modal-body",
  },
  {
    lane: "Ş10",
    name: "sunucu oluştur",
    async open(page: Page) {
      await page.getByTestId("create-server-button").click();
    },
    testId: "create-server-form",
  },
  {
    lane: "Ş11",
    name: "sunucu ayarları kabuğu",
    open: openServerSettings,
    testId: "server-settings-overlay",
  },
  {
    lane: "Ş12",
    name: "roller bölümü",
    async open(page: Page) {
      await openServerSettings(page);
      await page.getByTestId("server-settings-nav-roles").click();
    },
    testId: "server-settings-roles",
  },
  {
    lane: "Ş13",
    name: "tehlike bölgesi",
    async open(page: Page) {
      await openServerSettings(page);
      await page.getByTestId("server-settings-nav-danger").click();
    },
    testId: "server-settings-danger",
  },
] as const;

/** SPEC §8 — sol menünün dokuz bölümü, referanstaki sırayla. */
const SETTINGS_SECTIONS = [
  "general",
  "visibility",
  "content",
  "channels",
  "roles",
  "members",
  "invites",
  "events",
  "danger",
] as const;

/**
 * Sağ paneli **açık** hâle getirir.
 *
 * §11: `<1400`'te panel katmandır ve varsayılanı kapalıdır (içeriği örtmemesi için). Parity
 * matrisi hem eşiğin altında hem üstünde koşuyor, bu yüzden panelin durumu sorulur, varsayılmaz.
 */
async function openMemberPanel(page: Page): Promise<void> {
  const panel = page.getByTestId("server-member-panel");

  // Geniş düzende panel varsayılan açık; istemci viewport'u hydrate edene kadar düğmeye
  // basmak, paneli açmak yerine kapatır. Önce gerçek yüzeyi bekle, yalnız yoksa tetikle.
  const alreadyOpen = await panel
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (alreadyOpen) {
    return;
  }

  /*
   * Paneli açan düğme başlığın kendisindedir ve iki başlık var: metin kanalı
   * (`server-channel-members`, Ş6) ile ses kanalı (`server-voice-members`, Ş7). İkisi aynı
   * `ServerMemberPanel`i açar; hangisinin çizildiğini rota belirler.
   */
  const textHeaderButton = page.getByTestId("server-channel-members");
  const voiceHeaderButton = page.getByTestId("server-voice-members");
  const toggle = (await textHeaderButton.count()) > 0 ? textHeaderButton : voiceHeaderButton;

  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(panel).toBeVisible();
}

async function openServerSettings(page: Page): Promise<void> {
  await page.getByTestId("server-header-button").click();
  await page.getByTestId("server-menu-settings").click();
}

/** Ölçülen tema, istenen tema mı? (`ThemeSessionSync` hesabın temasını uygular.) */
async function expectAppliedTheme(page: Page, theme: ParityTheme): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Array.from(document.documentElement.classList).filter((name) =>
            name.startsWith("theme-"),
          ),
        ),
      { timeout: 10_000 },
    )
    .toEqual([theme]);
}

test.describe("Sunucu ekranı parity matrisi", () => {
  test.describe("Ş4 · kanal kenar çubuğu", () => {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const title = `${viewport.name} ${viewport.width}×${viewport.height} ×${viewport.expectedScale} · ${theme}`;

        test(title, async ({ page }) => {
          const { serverId, textChannelId } = await getE2EServerRoute();

          await setE2EUserTheme("alice", theme);
          await applyParityTheme(page, theme);
          await page.setViewportSize({ height: viewport.height, width: viewport.width });
          await loginAs(page, "alice");
          await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
            readyTestId: "channel-sidebar",
          });

          await expectAppliedTheme(page, theme);

          const rootFontSize = await waitForRootFontSize(page, viewport.expectedRootFontSize);

          // §2 — kolon 252, `rem` olduğu için ölçekle büyür.
          const scale = rootFontSize / 16;
          const sidebar = page.getByTestId("channel-sidebar");
          const sidebarBox = await sidebar.boundingBox();

          expect(sidebarBox?.width ?? 0).toBeCloseTo(CHANNEL_SIDEBAR_WIDTH * scale, -1);

          // §2.1/§2.3 — başlık ve arama tetikleyicisi her ölçekte yerinde.
          await expect(page.getByTestId("server-header-button")).toBeVisible();
          await expect(page.getByTestId("channel-search-trigger")).toBeVisible();

          await expectNoOverflow(page);
          await expectNoClippedText(page);

          await page.screenshot({
            path: `test-results/parity/server-sidebar-${viewport.name}-${theme}.png`,
          });
        });
      }
    }

    test("sunucu menüsü ve arama popover'ı aynı anda açık kalmaz", async ({ page }) => {
      const { serverId, textChannelId } = await getE2EServerRoute();

      await loginAs(page, "alice");
      await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
        readyTestId: "channel-sidebar",
      });

      /*
       * Sıra bilerek "önce popover, sonra menü". Sunucu menüsü kenar çubuğunun arama satırının
       * **üstünü** kaplıyor (§2.1 geometrisi: `Davet bağlantısı` satırı tam olarak
       * `Kanallarda ara` satırının yerine düşüyor). Menü açıkken arama tetikleyicisi gerçek bir
       * kullanıcı için de tıklanamaz; ters sırada test, ürünün yapamadığı bir şeyi ölçüyordu.
       */
      await page.getByTestId("channel-search-trigger").click();
      await expect(page.getByTestId("channel-search-popover")).toBeVisible();

      // K11: yeni açılan öncekini kapatır.
      await page.getByTestId("server-header-button").click();
      await expect(page.getByTestId("server-menu")).toBeVisible();
      await expect(page.getByTestId("channel-search-popover")).toBeHidden();

      // `Esc` en üstteki katmanı kapatır ve odak tetikleyiciye döner (Ş14 · A1).
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("server-menu")).toBeHidden();
      await expect(page.getByTestId("server-header-button")).toBeFocused();
    });

    test("arama popover'ı kanal süzer ve seçim kanala götürür", async ({ page }) => {
      const { serverId, textChannelId, voiceChannelId } = await getE2EServerRoute();

      await loginAs(page, "alice");
      await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
        readyTestId: "channel-sidebar",
      });

      await page.getByTestId("channel-search-trigger").click();
      await page.getByTestId("channel-search-input").fill("zzz-eslesmeyen");
      await expect(page.getByTestId("channel-search-empty")).toBeVisible();

      await page.getByTestId("channel-search-input").fill("");
      await page.getByTestId(`channel-search-hit-${voiceChannelId}`).click();
      await expect(page.getByTestId("channel-search-popover")).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`${voiceChannelId}$`, "u"));
    });
  });

  test.describe("Ş5 · sağ panel", () => {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const title = `${viewport.name} ${viewport.width}×${viewport.height} ×${viewport.expectedScale} · ${theme}`;

        test(title, async ({ page }) => {
          const { serverId, textChannelId } = await getE2EServerRoute();

          await setE2EUserTheme("alice", theme);
          await applyParityTheme(page, theme);
          await page.setViewportSize({ height: viewport.height, width: viewport.width });
          await loginAs(page, "alice");
          await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
            readyTestId: "channel-sidebar",
          });

          await openMemberPanel(page);
          await expectAppliedTheme(page, theme);

          const rootFontSize = await waitForRootFontSize(page, viewport.expectedRootFontSize);

          // §4 — kolon 326, `rem` olduğu için ölçekle büyür.
          const scale = rootFontSize / 16;
          const panel = page.getByTestId("server-member-panel");
          const panelBox = await panel.boundingBox();

          expect(panelBox?.width ?? 0).toBeCloseTo(RIGHT_PANEL_WIDTH * scale, -1);

          // §4.1 — iki grup + üye araması her ölçekte yerinde.
          await expect(page.getByTestId("server-member-search")).toBeVisible();
          await expect(page.getByTestId("server-panel-close")).toBeVisible();
          await expect(panel).toHaveAttribute("data-panel-content", "members");

          // §11 — `<1400px`'te panel akıştan çıkıp içeriğin üstüne biner. `base` (1360) eşiğin
          // altındadır; kalan üç çözünürlük üstünde ve panel kolon olarak durur.
          if (viewport.width < RIGHT_PANEL_OVERLAY_BELOW) {
            await expect(panel).toHaveAttribute("data-panel-overlay", "true");
          } else {
            await expect(panel).not.toHaveAttribute("data-panel-overlay", "true");
          }

          await expectNoOverflow(page);
          await expectNoClippedText(page);

          await page.screenshot({
            path: `test-results/parity/server-right-panel-${viewport.name}-${theme}.png`,
          });
        });
      }
    }

    test("başlıktaki `ara` düğmesi paneli arama içeriğine çevirir (§4.3)", async ({ page }) => {
      const { serverId, textChannelId } = await getE2EServerRoute();

      await loginAs(page, "alice");
      await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
        readyTestId: "channel-sidebar",
      });

      await openMemberPanel(page);

      const panel = page.getByTestId("server-member-panel");

      await expect(panel).toHaveAttribute("data-panel-content", "members");

      // Ş6: kanal başlığı `ServerChannelHeader`e geçti; `message-search-open` artık yalnız
      // grup DM başlığında var, sunucu kanalında arama düğmesi `server-channel-search`.
      await page.getByTestId("server-channel-search").click();
      await expect(panel).toHaveAttribute("data-panel-content", "search");
      await expect(page.getByTestId("server-panel-search")).toBeVisible();

      // §4.3 gelişmiş alan seti: üç alan + dört çip + thread anahtarı.
      await page.getByTestId("server-search-mode-advanced").click();
      await expect(page.getByTestId("server-search-author")).toBeVisible();
      await expect(page.getByTestId("server-search-channel")).toBeVisible();
      await expect(page.getByTestId("server-search-date-range")).toBeVisible();
      await expect(page.getByTestId("server-search-tag-file")).toBeVisible();
      await expect(page.getByTestId("server-search-thread-only")).toHaveAttribute("role", "switch");

      // Desteklenmeyen filtre seçilince uyarı belirir; uca uydurma parametre gitmez.
      await page.getByTestId("server-search-tag-file").click();
      await expect(page.getByTestId("server-search-unsupported")).toBeVisible();

      // Aynı anda tek içerik: kapatma paneli kapatır, üye listesi geri gelmez.
      await page.getByTestId("server-panel-close").click();
      await expect(panel).toBeHidden();
    });

    test("ses kanalında katılımcı paneline ve davet ayağına döner (§4.2)", async ({ page }) => {
      const { serverId, voiceChannelId } = await getE2EServerRoute();

      await loginAs(page, "alice");
      await gotoAppRoute(page, `/channels/${serverId}/${voiceChannelId}`, {
        readyTestId: "channel-sidebar",
      });

      await openMemberPanel(page);

      const panel = page.getByTestId("server-member-panel");

      await expect(panel).toHaveAttribute("data-panel-content", "voice");
      await expect(page.getByTestId("server-panel-joined-chip")).toBeVisible();
      await expect(page.getByTestId("server-panel-copy-invite")).toBeVisible();
      // Ses içeriğinde üye arama kutusu yoktur (SPEC §4.2).
      await expect(page.getByTestId("server-member-search")).toHaveCount(0);
    });
  });

  for (const surface of SURFACES) {
    test.describe(`${surface.lane} · ${surface.name}`, () => {
      for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
          const title = `${viewport.name} ${viewport.width}×${viewport.height} ×${viewport.expectedScale} · ${theme}`;

          test(title, async ({ page }) => {
            const { serverId, textChannelId } = await getE2EServerRoute();

            await setE2EUserTheme("alice", theme);
            await applyParityTheme(page, theme);
            await page.setViewportSize({ height: viewport.height, width: viewport.width });
            await loginAs(page, "alice");
            await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
              readyTestId: "channel-sidebar",
            });

            await expectAppliedTheme(page, theme);
            await surface.open(page);
            await expect(page.getByTestId(surface.testId)).toBeVisible();

            await waitForRootFontSize(page, viewport.expectedRootFontSize);

            await expectNoOverflow(page);
            await expectNoClippedText(page);

            await page.screenshot({
              path: `test-results/parity/server-${surface.lane}-${viewport.name}-${theme}.png`,
            });
          });
        }
      }
    });
  }

  /**
   * Ş7 · SPEC §5 — ses kanalı kendi rotasında ölçülür (`/channels/<server>/<voiceChannelId>`).
   * Diğer yüzeyler metin kanalından açıldığı için `SURFACES` döngüsüne girmiyor.
   */
  test.describe("Ş7 · ses kanalı", () => {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const title = `${viewport.name} ${viewport.width}×${viewport.height} ×${viewport.expectedScale} · ${theme}`;

        test(title, async ({ page }) => {
          const { serverId, voiceChannelId } = await getE2EServerRoute();

          await setE2EUserTheme("alice", theme);
          await applyParityTheme(page, theme);
          await page.setViewportSize({ height: viewport.height, width: viewport.width });
          await loginAs(page, "alice");
          await gotoAppRoute(page, `/channels/${serverId}/${voiceChannelId}`, {
            readyTestId: "server-voice-channel",
          });

          await expectAppliedTheme(page, theme);

          await waitForRootFontSize(page, viewport.expectedRootFontSize);

          // §5.1 — başlık; §5.4 — kontrol çubuğu. İkisi de her ölçekte yerinde.
          await expect(page.getByTestId("server-voice-krisp-chip")).toBeVisible();
          await expect(page.getByTestId("server-voice-control-leave")).toBeVisible();

          await expectNoOverflow(page);
          await expectNoClippedText(page);

          await page.screenshot({
            path: `test-results/parity/server-voice-${viewport.name}-${theme}.png`,
          });
        });
      }
    }

    test("kontrol çubuğu kapalı mikrofonu danger tonuna çevirir (§5.4)", async ({ page }) => {
      const { serverId, voiceChannelId } = await getE2EServerRoute();

      await loginAs(page, "alice");
      await gotoAppRoute(page, `/channels/${serverId}/${voiceChannelId}`, {
        readyTestId: "server-voice-channel",
      });

      const mic = page.getByTestId("server-voice-control-mic");

      await expect(mic).toHaveAttribute("data-tone", "neutral");
      await mic.click();
      await expect(mic).toHaveAttribute("data-tone", "danger");
      await expect(mic).toHaveAttribute("aria-pressed", "true");
    });
  });

  /**
   * SPEC §8 — dokuz bölümün her biri gerçekten açılıyor ve taşmıyor. Bölümler `lazy` yüklendiği
   * için (PROMPT §11) tutamağın görünmesi Skeleton'ın gerçek gövdeye döndüğünün de kanıtı.
   *
   * Dört çözünürlük burada tekrar edilmiyor: bölüm gövdeleri ayarlar kabuğunun içinde yaşıyor
   * ve kabuk zaten dört çözünürlükte ölçülüyor (Ş11 satırı). Tekrar, aynı kabuğu dokuz kez
   * yeniden ölçmek olurdu.
   */
  test.describe("§8 · dokuz ayar bölümü", () => {
    for (const theme of THEMES) {
      test(`dokuz bölüm taşmadan açılır · ${theme}`, async ({ page }) => {
        const { serverId, textChannelId } = await getE2EServerRoute();

        await setE2EUserTheme("alice", theme);
        await applyParityTheme(page, theme);
        await page.setViewportSize({ height: 920, width: 1360 });
        await loginAs(page, "alice");
        await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
          readyTestId: "channel-sidebar",
        });

        await openServerSettings(page);
        await expect(page.getByTestId("server-settings-overlay")).toBeVisible();

        for (const section of SETTINGS_SECTIONS) {
          await page.getByTestId(`server-settings-nav-${section}`).click();
          await expect(page.getByTestId(`server-settings-${section}`)).toBeVisible();
          await expectNoOverflow(page);
          await expectNoClippedText(page);
        }

        await page.screenshot({
          path: `test-results/parity/server-settings-sections-${theme}.png`,
        });
      });
    }
  });

  /**
   * SPEC §11 — dört kırılım. Ölçek adımı 1360'ın altında ×1'de sabit kaldığı için burada
   * ölçülen şey kompozisyon: hangi kolon kolonda, hangisi drawer'da.
   */
  test.describe("§11 · kırılımlar", () => {
    test("1400'ün altında sağ panel içeriğin üstüne biner", async ({ page }) => {
      const { serverId, textChannelId } = await getE2EServerRoute();

      await loginAs(page, "alice");
      await page.setViewportSize({ height: 900, width: RIGHT_PANEL_OVERLAY_BELOW - 40 });
      await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
        readyTestId: "channel-sidebar",
      });

      await openMemberPanel(page);

      const panel = page.getByTestId("server-member-panel");

      // Eşiğin altında panel akıştan çıkar; kanal kenar çubuğu **kolonda kalır** (§11).
      await expect(panel).toHaveAttribute("data-panel-overlay", "true");
      await expect(page.getByTestId("channel-sidebar")).toBeVisible();
      await expect(page.getByTestId("app-nav-panel")).toBeVisible();
      await expectNoOverflow(page);
    });

    test("1200'ün altında gezinme paneli düşer, kanal kenar çubuğu kalır", async ({ page }) => {
      const { serverId, textChannelId } = await getE2EServerRoute();

      await loginAs(page, "alice");
      await page.setViewportSize({ height: 900, width: 1180 });
      await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
        readyTestId: "channel-sidebar",
      });

      await expect(page.getByTestId("channel-sidebar")).toBeVisible();
      await expect(page.getByTestId("server-rail")).toBeVisible();
      await expect(page.getByTestId("app-nav-panel")).toBeHidden();
      /*
       * Sohbet rotasında kabuğun **öndeki** kontrolü geri düğmesidir, drawer tetikleyicisi
       * değil (`MobileShellControls`, `canGoBack = isDmRoute || isServerConversationRoute`).
       * İkisi aynı yuvayı paylaşıyor ve sunucu kanalında geri düğmesi zaten çalışma alanı
       * çekmecesini açıyor (`handleMobileBack` → `setMobileSidebarOpen(true)`).
       */
      await expect(page.getByTestId("mobile-shell-back-button")).toBeVisible();
      await expectNoOverflow(page);
    });

    test("960'ın altında kanal kenar çubuğu drawer'a taşınır", async ({ page }) => {
      const { serverId, textChannelId } = await getE2EServerRoute();

      await loginAs(page, "alice");
      await page.setViewportSize({ height: 900, width: 940 });
      await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
        readyTestId: "server-rail",
      });

      await expect(page.getByTestId("channel-sidebar")).toBeHidden();

      // Sunucu kanalında çekmeceyi açan kontrol geri düğmesidir (bkz. §11'in bir üstteki maddesi).
      await page.getByTestId("mobile-shell-back-button").click();
      await expect(page.getByTestId("mobile-workspace-drawer")).toBeVisible();
      await expect(page.getByTestId("channel-sidebar")).toBeVisible();
      await expectNoOverflow(page);
    });

    test("1024'ün altında ayarlar tek kolona düşer, menü forma üstten eklenir", async ({
      page,
    }) => {
      const { serverId, textChannelId } = await getE2EServerRoute();

      await loginAs(page, "alice");
      await page.setViewportSize({ height: 920, width: 1360 });
      await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
        readyTestId: "channel-sidebar",
      });

      await openServerSettings(page);
      await expect(page.getByTestId("server-settings-overlay")).toBeVisible();

      const wideNav = await page.getByTestId("server-settings-nav").boundingBox();
      const wideBody = await page.getByTestId("server-settings-body").boundingBox();

      // İki kolon: menü gövdenin **solunda**.
      expect(wideNav?.x ?? 0).toBeLessThan(wideBody?.x ?? 0);

      /*
        Eşik CSS'te (`buildServerSingleColumnCss`), JavaScript'te değil: kaplama açıkken
        genişliği düşürmek yeterli. Drawer'dan geçmiyoruz çünkü ölçülen şey ayarların
        kompozisyonu, kabuğun kırılımı değil — o üstteki üç testin işi.
      */
      await page.setViewportSize({ height: 900, width: 940 });

      const narrowNav = await page.getByTestId("server-settings-nav").boundingBox();
      const narrowBody = await page.getByTestId("server-settings-body").boundingBox();

      // Tek kolon: menü gövdenin **üstünde**.
      expect(narrowNav?.y ?? 0).toBeLessThan(narrowBody?.y ?? 0);
      expect(narrowNav?.x ?? 0).toBeCloseTo(narrowBody?.x ?? 0, -1);
      await expectNoOverflow(page);
    });
  });
});
