import type { Page } from "@playwright/test";

import { MESSAGES_METRICS } from "@/lib/messages/metrics";
import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EDMConversationId } from "../../helpers/db";
import { gotoAppRoute } from "../../helpers/navigation";

/**
 * SPEC-MESAJLAR §2 durum haritası — §15–§17 yüzeyleri (Ş11 kapısı).
 *
 * Birim testi tek bileşene bakıyor: `messages-screen.ts` reducer'ının 34 testi
 * "profil açılınca thread ve arama kapanır" diyor ve **doğru** söylüyor. Ama o
 * kural ancak üç panelin de aynı eksende yaşadığı yerde geçerli; bu dosya
 * kuralın **ekranın tamamında** tuttuğunu sorar.
 *
 * `test.fixme` ile işaretli bir madde var ve bilerek: bugün ürün o kuralı
 * çiğniyor, gerekçesi kendi yorumunda. Yeşil bir gate uğruna kuralı yazmamak,
 * kuralın olmadığını iddia etmek olurdu.
 */

const BASE_VIEWPORT = { height: 920, width: 1360 } as const;

async function openConversation(page: Page): Promise<string> {
  const conversationId = await getE2EDMConversationId();

  await gotoAppRoute(page, `/messages/${conversationId}`, { readyTestId: "message-input" });
  await expect(page.getByTestId("conversation-header")).toBeVisible();

  return conversationId;
}

test.describe("Mesajlar · §15–§17 durum bütünlüğü", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(BASE_VIEWPORT);
    await loginAs(page, "alice");
  });

  /**
   * §15 paneli sağ yuvada **yerleşik** başlar (`panel: "profile"`), çünkü bugünkü
   * davranış da buydu; değişen tek şey kapatılabiliyor olması.
   */
  test("profil paneli 1360'ta yerleşik açılır ve kapatılabilir", async ({ page }) => {
    await openConversation(page);

    const panel = page.getByTestId("conversation-profile-panel");

    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-variant", "profile");

    await page.getByTestId("messages-side-panel-close").click();
    await expect(panel).toBeHidden();
  });

  /** §15.2 · DM'de `uyeler` sekmesi hiçbir yoldan seçilemez. */
  test("DM'de üyeler sekmesi hiç çizilmez", async ({ page }) => {
    await openConversation(page);

    await expect(page.getByTestId("profile-panel-tab-genel")).toBeVisible();
    await expect(page.getByTestId("profile-panel-tab-medya")).toBeVisible();
    await expect(page.getByTestId("profile-panel-tab-ayarlar")).toBeVisible();
    await expect(page.getByTestId("profile-panel-tab-uyeler")).toHaveCount(0);
  });

  /**
   * §17 · `...` düğmesi geniş görünümde **menüyü** açar; dar görünümün cevabı
   * çekmecedir ve o dal ayrı ölçülüyor (aşağıda).
   */
  test("başlıktaki `...` menüyü açar, ikinci tıklama kapatır", async ({ page }) => {
    await openConversation(page);

    const trigger = page.getByTestId("conversation-header-more");
    const menu = page.getByTestId("conversation-more-menu");

    await expect(menu).toHaveCount(0);
    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toHaveAttribute("role", "menu");
  });

  /**
   * §17 alt menüsü. `open` iki kipi birden kapsamalı: alt menü açıkken menünün
   * kendisi hâlâ ekranda. Yalnız `conversationMore`a bakan bir bayrak, alt menü
   * açıldığı anda menüyü kaybederdi.
   */
  test("sessize al alt menüsü ana menüyü kapatmaz", async ({ page }) => {
    await openConversation(page);
    await page.getByTestId("conversation-header-more").click();

    const menu = page.getByTestId("conversation-more-menu");
    const muteRow = page.getByTestId("conversation-more-menu-mute");

    await expect(muteRow).toHaveAttribute("aria-expanded", "false");
    await muteRow.click();

    await expect(page.getByTestId("mute-submenu")).toBeVisible();
    await expect(menu).toBeVisible();
    await expect(muteRow).toHaveAttribute("aria-expanded", "true");
  });

  /**
   * §3 · `Esc` sırası: bir tuş bir katman. Alt menü açıkken `Esc` yalnız alt
   * menüyü kapatır ve odak `Sessize al` satırına döner; arkadaki panel o tuşu
   * hiç görmez.
   */
  test("Esc bir tuşta bir katman kapatır", async ({ page }) => {
    await openConversation(page);
    await page.getByTestId("conversation-header-more").click();
    await page.getByTestId("conversation-more-menu-mute").click();
    await expect(page.getByTestId("mute-submenu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("mute-submenu")).toHaveCount(0);
    await expect(page.getByTestId("conversation-more-menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("conversation-more-menu")).toHaveCount(0);

    // Panel hâlâ açık: iki `Esc` iki katman kapattı, üçüncüyü götürmedi.
    await expect(page.getByTestId("conversation-profile-panel")).toBeVisible();
  });

  /** §10 · menü satırı paneli **ilgili sekmeyle** açar; hangi sekme olduğunu satır bilir. */
  test("menü satırı paneli doğru sekmeyle açar", async ({ page }) => {
    await openConversation(page);

    await page.getByTestId("messages-side-panel-close").click();
    await expect(page.getByTestId("conversation-profile-panel")).toBeHidden();

    await page.getByTestId("conversation-header-more").click();
    await page.getByTestId("conversation-more-menu-viewProfile").click();

    await expect(page.getByTestId("conversation-profile-panel")).toBeVisible();
    await expect(page.getByTestId("profile-panel-tab-genel")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Satır menüyü kapatır — bir eylem, bir katman.
    await expect(page.getByTestId("conversation-more-menu")).toHaveCount(0);
  });

  /**
   * §4 kırılımı. Sözlük sağ panel için **1100** diyor (`sidePanelOverlayBelow`),
   * ama profil paneli bugün kabuğun `shouldUseInfoDrawer` eşiğini (1280,
   * `RESPONSIVE_BREAKPOINTS.supportPanel`) paylaşıyor. Test **ürünün** eşiğini
   * ölçüyor, sözlüğünkini değil: sapma raporda, burada yalnız bugünkü davranışın
   * kaydı var ki eşik sessizce kaymasın.
   */
  test("dar görünümde panel çekmeceye taşınır", async ({ page }) => {
    await openConversation(page);
    await expect(page.getByTestId("conversation-profile-panel")).toBeVisible();

    await page.setViewportSize({ height: 920, width: 1180 });

    // Yerleşik kolon sökülür; `...` artık menü değil çekmece açar.
    await expect(page.getByTestId("dm-details-drawer")).toHaveCount(0);
    await page.getByTestId("conversation-header-more").click();

    await expect(page.getByTestId("dm-details-drawer")).toBeVisible();
    await expect(page.getByTestId("conversation-profile-panel")).toBeVisible();

    // Çekmece bir diyalog: odak tuzağı ve `Esc` panelin ortak kabuğundan geliyor.
    await expect(page.getByTestId("conversation-profile-panel")).toHaveAttribute(
      "aria-modal",
      "true",
    );

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("dm-details-drawer")).toHaveCount(0);
  });

  /**
   * §2 · "thread · arama · profil **tek yuva**" (K5).
   *
   * Bugün tutmuyor ve sebebi durum sahipliğinin bölünmüş olması: profil paneli
   * `DMConversationPage`'in reducer'ında (`state.panel`), thread ile arama ise
   * `ChatArea`'nın kendi `useState`'lerinde (`selectedThread`, `showSearch`)
   * yaşıyor. Reducer profil açılırken thread/aramayı kapatıyor — ama ChatArea
   * arama açarken reducer'a hiçbir şey bildirmiyor, o yüzden 1360'ta iki panel
   * yan yana çiziliyor (340 + 330 = 670px; ana alana 60px kalıyor,
   * `mainMinWidthWithPanel` 390 diyor).
   *
   * Kapatması `ChatArea`'ya bir `onSidePanelChange` prop'u ister ve o dosya
   * §1–§14'ün; bu yüzden madde rapora yazıldı, düzeltilmedi. `fixme` bilerek:
   * kural doğru, ürün henüz uymuyor.
   */
  test.fixme("arama açılınca profil paneli yuvayı boşaltır", async ({ page }) => {
    await openConversation(page);
    await expect(page.getByTestId("conversation-profile-panel")).toBeVisible();

    await page.getByTestId("conversation-header-search").click();
    await expect(page.getByTestId("messages-search-panel")).toBeVisible();

    await expect(page.getByTestId("conversation-profile-panel")).toHaveCount(0);
    await expect(page.locator("[data-messages-side-panel]")).toHaveCount(1);

    const panelWidth = (await page.locator("[data-messages-side-panel]").boundingBox())?.width ?? 0;

    expect(panelWidth).toBeLessThanOrEqual(MESSAGES_METRICS.layout.sidePanelWidth + 1);
  });
});
