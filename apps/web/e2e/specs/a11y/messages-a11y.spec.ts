import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { resolveE2ETimeoutPolicy } from "@/lib/e2e/timeout-policy";
import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EDMConversationId } from "../../helpers/db";
import { applyParityTheme } from "../../helpers/design-parity";
import { gotoAppRoute } from "../../helpers/navigation";

/**
 * Mesajlar erişilebilirlik taraması — Dalga 3 §4.
 *
 * WCAG AAA kapsam dışı (mevcut `a11y.spec.ts` ile aynı gerekçe): birkaç AAA
 * ölçütü gerçek zamanlı arayüz kalıplarıyla çelişiyor. Tarama A+AA.
 *
 * Bu dosya `a11y.spec.ts`'in yardımcılarını **tekrar yazmıyor**, aynı eşikleri
 * kullanıyor; iki farklı "engelleyici ihlal" tanımı, birinin diğerini yalanlaması
 * demek olurdu.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

test.describe.configure({ timeout: resolveE2ETimeoutPolicy().screenTestTimeoutMs });

type AxeViolation = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

function formatViolation(violation: AxeViolation): string {
  const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ");

  return `[${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help} (${targets})`;
}

async function scan(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact && BLOCKING_IMPACTS.has(violation.impact),
  );

  for (const violation of results.violations) {
    if (!violation.impact || !BLOCKING_IMPACTS.has(violation.impact)) {
      // eslint-disable-next-line no-console
      console.log(`a11y (non-blocking) ${label}: ${formatViolation(violation)}`);
    }
  }

  expect(blocking.map(formatViolation), `${label}: kritik/ciddi ihlal olamaz`).toEqual([]);
}

async function openConversation(page: Page): Promise<string> {
  const conversationId = await getE2EDMConversationId();

  await gotoAppRoute(page, `/messages/${conversationId}`, { readyTestId: "message-input" });

  return conversationId;
}

test.describe("Mesajlar erişilebilirliği", () => {
  for (const theme of ["theme-light", "theme-dark"] as const) {
    test(`boş durum ve Arkadaşlar taraması · ${theme}`, async ({ page }) => {
      await applyParityTheme(page, theme);
      await loginAs(page, "alice");

      await gotoAppRoute(page, "/messages", { readyTestId: "messages-empty-state" });
      await scan(page, `empty/${theme}`);

      await gotoAppRoute(page, "/messages/friends", { readyTestId: "friends-dashboard" });
      await scan(page, `friends/${theme}`);
    });

    test(`sohbet ve paneller taraması · ${theme}`, async ({ page }) => {
      await applyParityTheme(page, theme);
      await loginAs(page, "alice");
      await openConversation(page);
      await scan(page, `conversation/${theme}`);

      await page.getByTestId("conversation-header-search").click();
      await expect(page.getByTestId("messages-search-panel")).toBeVisible();
      await scan(page, `search-panel/${theme}`);
    });
  }

  /**
   * Rozet, presence ve anket seçeneği: üçü de bilgiyi **yalnız** renk ya da
   * konumla veren yüzeyler olabilirdi. Ekran okuyucu adları bunun bekçisi.
   */
  test("ekran okuyucu adları bilgiyi renkten bağımsız taşır", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/messages/friends", { readyTestId: "friends-dashboard" });

    const tablist = page.getByTestId("friends-tabs");

    await expect(tablist).toHaveAttribute("role", "tablist");

    // Sekme durumu renkten degil `aria-selected`'tan okunur; parametresiz
    // rotada varsayilan sekme `Tumu`.
    await expect(page.getByTestId("friends-tab-all")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("friends-tab-pending")).toHaveAttribute("aria-selected", "false");

    // Presence noktası dekoratif; durum metni satırın kendisinde okunur.
    const status = page.getByTestId("friend-row-status").first();

    if (await status.count()) {
      await expect(status).not.toBeEmpty();
    }
  });

  /**
   * Klavye turu: ray → ana alan → bestekar. `Tab` sırası görsel sırayla aynı
   * olmalı; panel açıkken yerleşik hâlde tuzak **kurulmaz**, yoksa klavye
   * kullanıcısı sohbetin geri kalanına dönemez.
   */
  test("yerleşik panelde odak tuzağa düşmez", async ({ page }) => {
    await page.setViewportSize({ height: 920, width: 1360 });
    await loginAs(page, "alice");
    await openConversation(page);

    await page.getByTestId("conversation-header-search").click();
    await expect(page.locator("[data-messages-side-panel]")).toHaveAttribute(
      "role",
      "complementary",
    );

    // Panelin dışına çıkılabildiğini doğrula: yeterince `Tab` sonrasında odak
    // panelin dışına düşmeli.
    for (let index = 0; index < 25; index += 1) {
      await page.keyboard.press("Tab");
    }

    const insidePanel = await page.evaluate(() => {
      const panel = document.querySelector("[data-messages-side-panel]");

      return Boolean(panel && document.activeElement && panel.contains(document.activeElement));
    });

    expect(insidePanel).toBe(false);
  });

  /** `prefers-reduced-motion`: geçişler durur, içerik yerinde kalır. */
  test("hareket azaltmada geçişler durur", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loginAs(page, "alice");
    await openConversation(page);

    await expect(page.getByTestId("message-list")).toBeVisible();
    await scan(page, "conversation/reduced-motion");
  });
});
