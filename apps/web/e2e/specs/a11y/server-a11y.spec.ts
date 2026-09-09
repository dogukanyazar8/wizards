import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { resolveE2ETimeoutPolicy } from "@/lib/e2e/timeout-policy";
import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EServerRoute } from "../../helpers/db";
import { applyParityTheme } from "../../helpers/design-parity";
import {
  WCAG_TAGS,
  formatViolation,
  partitionAxeViolations,
  reportNonBlockingViolations,
} from "../../helpers/a11y-gate";
import { gotoAppRoute } from "../../helpers/navigation";

/**
 * Sunucu ekranı erişilebilirlik taraması — `SPEC-SUNUCU.md` §12, `PROMPT.md` §9, Ş14.
 *
 * WCAG AAA kapsam dışı (`a11y.spec.ts` ve `messages-a11y.spec.ts` ile aynı gerekçe): birkaç
 * AAA ölçütü gerçek zamanlı arayüz kalıplarıyla çelişiyor. Tarama A + AA.
 *
 * Yardımcılar **tekrar yazılmıyor**: eşikler ve "engelleyici ihlal" tanımı kardeş dosyalarla
 * aynı. İki farklı tanım, birinin diğerini yalanlaması demek olurdu.
 *
 * Ş6/Ş7 sonrası kapsam paketin **tamamı**: metin kanalı başlığı ve ses kanalı yüzeyi de
 * taranıyor. Mesaj listesinin kendisi Mesajlar paketinin işi ve `a11y.spec.ts` →
 * "server text channel view" altında zaten koşuyor.
 */

test.describe.configure({ timeout: resolveE2ETimeoutPolicy().screenTestTimeoutMs });

async function scan(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const partition = partitionAxeViolations(results.violations);

  reportNonBlockingViolations(partition, label);

  expect(partition.blocking.map(formatViolation), `${label}: kritik/ciddi ihlal olamaz`).toEqual(
    [],
  );
}

async function openServerRoute(page: Page): Promise<void> {
  const { serverId, textChannelId } = await getE2EServerRoute();

  await loginAs(page, "alice");
  await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
    readyTestId: "channel-sidebar",
  });
}

async function openServerSettings(page: Page): Promise<void> {
  await page.getByTestId("server-header-button").click();
  await page.getByTestId("server-menu-settings").click();
  await expect(page.getByTestId("server-settings-overlay")).toBeVisible();
}

/** SPEC §8 — sol menünün dokuz bölümü. */
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

test.describe("Sunucu ekranı erişilebilirliği", () => {
  for (const theme of ["theme-light", "theme-dark"] as const) {
    test(`kabuk · sunucu menüsü · arama popover'ı · ${theme}`, async ({ page }) => {
      await applyParityTheme(page, theme);
      await openServerRoute(page);
      await scan(page, `shell/${theme}`);

      /*
       * Sıra "önce popover, sonra menü": sunucu menüsü kenar çubuğunun arama satırının üstünü
       * kaplıyor (§2.1) ve menü açıkken tetikleyici gerçek bir kullanıcı için de tıklanamaz.
       */
      await page.getByTestId("channel-search-trigger").click();
      await expect(page.getByTestId("channel-search-popover")).toBeVisible();
      await scan(page, `channel-search/${theme}`);

      // K11: yeni açılan öncekini kapatır — iki açılır aynı anda taranmaz.
      await page.getByTestId("server-header-button").click();
      await expect(page.getByTestId("server-menu")).toBeVisible();
      await expect(page.getByTestId("channel-search-popover")).toBeHidden();
      await scan(page, `server-menu/${theme}`);
    });

    test(`sağ panel · üyeler ve arama · ${theme}`, async ({ page }) => {
      await applyParityTheme(page, theme);
      await openServerRoute(page);

      // §11: `<1400`'te panel katmandır ve kapalı başlar; tarama önce onu açar.
      await page.getByTestId("server-channel-members").click();

      await expect(page.getByTestId("server-member-panel")).toBeVisible();
      await scan(page, `member-panel/${theme}`);

      // Ş6: sunucu kanalında arama düğmesi `server-channel-search` (eski `message-search-open`
      // yalnız grup DM başlığında kaldı).
      await page.getByTestId("chat-channel-header").getByTestId("server-channel-search").click();
      await expect(page.getByTestId("server-member-panel")).toHaveAttribute(
        "data-panel-content",
        "search",
      );
      await scan(page, `search-panel/${theme}`);
    });

    test(`sunucu ayarları · dokuz bölüm · ${theme}`, async ({ page }) => {
      await applyParityTheme(page, theme);
      await openServerRoute(page);
      await openServerSettings(page);

      for (const section of SETTINGS_SECTIONS) {
        await page.getByTestId(`server-settings-nav-${section}`).click();
        await expect(page.getByTestId(`server-settings-${section}`)).toBeVisible();
        await scan(page, `settings/${section}/${theme}`);
      }
    });

    test(`pencereler · kanal · davet · sunucu oluştur · ${theme}`, async ({ page }) => {
      await applyParityTheme(page, theme);
      await openServerRoute(page);

      await page.getByTestId("server-header-button").click();
      await page.getByTestId("server-menu-createChannel").click();
      await expect(page.getByTestId("channel-form")).toBeVisible();
      await scan(page, `channel-modal/${theme}`);
      await page.keyboard.press("Escape");

      await page.getByTestId("server-header-button").click();
      await page.getByTestId("server-menu-invite").click();
      await expect(page.getByTestId("server-invite-modal-body")).toBeVisible();
      await scan(page, `invite-modal/${theme}`);
      await page.keyboard.press("Escape");

      await page.getByTestId("create-server-button").click();
      await expect(page.getByTestId("create-server-form")).toBeVisible();
      await scan(page, `create-server/${theme}`);
    });
  }

  /**
   * §12 — "Menü ve pencereler: `Esc` kapatır, açılışta ilk odaklanabilir öğeye focus,
   * kapanışta tetikleyen düğmeye dönüş." Üçü de tek testte, çünkü üçü tek davranışın
   * parçası: kullanıcı menüyü klavyeyle açıp kapatabiliyor mu?
   */
  test("sunucu menüsü klavyeyle açılır, `Esc` kapatır, odak tetikleyiciye döner", async ({
    page,
  }) => {
    await openServerRoute(page);

    const trigger = page.getByTestId("server-header-button");

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("server-menu")).toBeVisible();

    // Açılışta ilk satır odaklı.
    await expect(page.getByTestId("server-menu-invite")).toBeFocused();

    // Ok tuşları menüyü dolaşır.
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("server-menu-createCategory")).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByTestId("server-menu-leave")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("server-menu")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  /**
   * Ş7 · SPEC §5 — ses kanalı kendi rotasında taranır. Kart, dalga ve kontrol çubuğu yalnız
   * orada var; metin kanalından ölçülemez.
   */
  for (const theme of ["theme-light", "theme-dark"] as const) {
    test(`ses kanalı · ızgara ve kontrol çubuğu · ${theme}`, async ({ page }) => {
      const { serverId, voiceChannelId } = await getE2EServerRoute();

      await applyParityTheme(page, theme);
      await loginAs(page, "alice");
      await gotoAppRoute(page, `/channels/${serverId}/${voiceChannelId}`, {
        readyTestId: "server-voice-channel",
      });

      await scan(page, `voice/${theme}`);
    });
  }

  /**
   * §12 — "Ses kartlarındaki konuşma halkası tek görsel ipucu olamaz." Kart, durumu her
   * hâlde metinle de söyler; `prefers-reduced-motion` altında dalga durur ama kaybolmaz.
   */
  test("ses kartı durumu renkten bağımsız okunur ve hareket azaltmada dalga durur", async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();

    try {
      const { serverId, voiceChannelId } = await getE2EServerRoute();

      await loginAs(page, "alice");
      await gotoAppRoute(page, `/channels/${serverId}/${voiceChannelId}`, {
        readyTestId: "server-voice-channel",
      });

      // Kartın durum cümlesi her zaman DOM'da (`sr-only`), renkten bağımsız.
      await expect(page.getByTestId("server-voice-tile-status").first()).toHaveCount(1);

      const animations = await page
        .locator(".voice-wave-bar")
        .evaluateAll((nodes) => nodes.map((node) => window.getComputedStyle(node).animationName));

      expect(animations.every((name) => name === "none")).toBe(true);
    } finally {
      await context.close();
    }
  });

  /**
   * §12 — ayarların **içinden** açılan satır menüsü. `Esc` önce menüyü kapatmalı; kaplamayı
   * kapatırsa kullanıcı bulunduğu yerden atılır (K11 kural 3, `layer-stack.ts`).
   */
  test("üye satırı menüsünde `Esc` menüyü kapatır, ayarları bırakır", async ({ page }) => {
    await openServerRoute(page);
    await openServerSettings(page);

    await page.getByTestId("server-settings-nav-members").click();
    await expect(page.getByTestId("server-settings-members")).toBeVisible();

    const menuTrigger = page.locator('[data-testid^="server-settings-member-menu-"]').first();

    await menuTrigger.click();
    await expect(page.locator('[role="menu"]').first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
    await expect(page.getByTestId("server-settings-overlay")).toBeVisible();

    // İkinci `Esc` artık kaplamanındır.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("server-settings-overlay")).toBeHidden();
  });

  /**
   * §12 — "Ses kartlarındaki konuşma halkası tek görsel ipucu olamaz." Kenar çubuğundaki
   * katılımcı satırı susturulmuş/konuşan durumunu metinle de taşır.
   */
  test("ekran okuyucu adları bilgiyi renkten bağımsız taşır", async ({ page }) => {
    await openServerRoute(page);

    // Okunmamış rozeti sayıyı cümleyle söyler (00 §8).
    const unreadBadges = page.locator('[data-testid="channel-sidebar"] [aria-label*="okunmamış"]');

    expect(await unreadBadges.count()).toBeGreaterThanOrEqual(0);

    // İkon-only düğmelerin hepsinin erişilebilir adı var.
    const namelessIconButtons = await page
      .locator('[data-testid="channel-sidebar"] button')
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => {
            const hasText = (node.textContent ?? "").trim().length > 0;
            const hasLabel =
              node.getAttribute("aria-label") !== null ||
              node.getAttribute("aria-labelledby") !== null ||
              node.getAttribute("title") !== null;

            return !hasText && !hasLabel;
          })
          .map((node) => node.outerHTML.slice(0, 120)),
      );

    expect(namelessIconButtons, "ikon-only düğmelerin adı olmalı").toEqual([]);
  });
});
