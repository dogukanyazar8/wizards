import type { Locator, Page } from "@playwright/test";

import { test, expect } from "../../fixtures/test";
import { apiLoginAs, e2eRequestHeaders } from "../../helpers/api-auth";
import { loginAs } from "../../helpers/auth";
import {
  addE2EServerMember,
  createIsolatedServerForMembershipTest,
  deleteIsolatedE2EServer,
} from "../../helpers/db";
import { gotoAppRoute } from "../../helpers/navigation";

test.describe("server smoke", () => {
  test("user can create and open a server", async ({ page }) => {
    const serverName = `Whispr Smoke ${Date.now()}`;

    await loginAs(page, "alice");
    await gotoAppRoute(page, "/messages", { readyTestId: "create-server-button" });
    await page.getByTestId("create-server-button").click();

    await expect(page.getByTestId("create-server-form")).toBeVisible();
    await page.getByTestId("create-server-name").fill(serverName);
    // Ş10: kısaltma **tam** 3 karakter (`ServerAbbreviationSchema`); eski 4 harfli
    // değer artık `maxLength` tarafından kırpılır ve gönderim kapısı hiç açılmazdı.
    await page.getByTestId("create-server-short-name").fill("SMK");
    await page
      .getByTestId("create-server-description")
      .fill("Created by the Playwright smoke suite.");
    await page.getByTestId("create-server-submit").click();

    await expect(page).toHaveURL(/\/channels\/[0-9a-f-]+\/[0-9a-f-]+/i);
    const channelSidebar = page.getByTestId("channel-sidebar");
    await expect(channelSidebar).toContainText(serverName);
    await expect(channelSidebar).toContainText("welcome-chat");
    await expect(channelSidebar).toContainText("live-room");
  });

  test("server creation rejects empty and overlong names", async ({ page, request }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/messages", { readyTestId: "create-server-button" });
    await page.getByTestId("create-server-button").click();

    const submit = page.getByTestId("create-server-submit");

    await expect(page.getByTestId("create-server-form")).toBeVisible();
    await expect(submit).toBeDisabled();

    // Kısa adı geçerli yap: geriye tek geçersiz alan (**ad**) kalsın, kapanık kapı gerçekten
    // onu ölçsün. İki alan birden geçersizken "disabled" hangisinden geldiğini söylemez.
    await page.getByTestId("create-server-short-name").fill("SMK");
    await page.getByTestId("create-server-name").fill("A");
    await expect(page.getByTestId("create-server-note")).toHaveText(
      /3 karakterli kısa ad|3-character short name/i,
    );
    await expect(submit).toBeDisabled();

    // Sınırın öbür yanı: `isCreateServerNameValid` eşiği 2, kapalılık adın uzunluğundan geliyor.
    await page.getByTestId("create-server-name").fill("AB");
    await expect(submit).toBeEnabled();

    await apiLoginAs(request, "alice");
    const response = await request.post("/api/v1/servers", {
      data: {
        name: "x".repeat(65),
        // Ş10 sonrası `shortName` **tam** 3 karakter; 4 harfli bir değer 400'ü tek başına
        // üretir ve ad uzunluğu sınırı hiç sınanmazdı. Kısaltma geçerli, ad geçersiz.
        shortName: "LNG",
      },
      headers: e2eRequestHeaders,
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  });

  test("server short-name label stays on one line while typing", async ({ page }) => {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/messages", { readyTestId: "create-server-button" });
    await page.getByTestId("create-server-button").click();

    const input = page.getByTestId("create-server-short-name");
    const label = page.locator('label[for="create-server-short-name"]');
    await expect(label).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const readGeometry = () =>
      label.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const inputNode = document.getElementById("create-server-short-name");
        if (!(inputNode instanceof HTMLInputElement)) {
          throw new Error("Create-server short-name input is missing.");
        }
        const inputRect = inputNode.getBoundingClientRect();
        const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);

        return { height: rect.height, inputOffset: inputRect.top - rect.top, lineHeight };
      });

    const initial = await readGeometry();
    expect(initial.height).toBeCloseTo(initial.lineHeight, 0);

    for (const value of ["A", "AB", "ABC", ""]) {
      await input.fill(value);
      const current = await readGeometry();
      expect(current.height).toBeCloseTo(initial.height, 0);
      // Sözleşme "etiket ikinci satıra kırılmaz": kırılma girdiyi bir satır boyu (≥ lineHeight)
      // aşağı iter. WebKit alt piksel yerleşimi sayaç değişince ~0.7px oynatıyor; o kırılma değil.
      expect(Math.abs(current.inputOffset - initial.inputOffset)).toBeLessThan(
        initial.lineHeight / 2,
      );
    }
  });

  test("non-owners cannot delete another user's server", async ({ request }) => {
    const { serverId } = await createIsolatedServerForMembershipTest("alice");

    try {
      await addE2EServerMember(serverId, "bob");
      await apiLoginAs(request, "bob");
      const response = await request.delete(`/api/v1/servers/${serverId}`, {
        data: {
          confirmationName: "Whispr E2E Membership",
        },
        headers: e2eRequestHeaders,
      });

      expect(response.status()).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "Only the server owner can perform this action",
      });
    } finally {
      await deleteIsolatedE2EServer(serverId);
    }
  });

  test("channel advanced settings persist across create, edit, and refresh", async ({ page }) => {
    const { serverId, textChannelId } = await createIsolatedServerForMembershipTest("alice");
    const voiceName = `advanced-voice-${Date.now().toString(36)}`;
    const textName = `advanced-text-${Date.now().toString(36)}`;

    // Ş8: kanal penceresi SPEC §6.2'nin dört adımına geçti. `<details>` + dört `<select>`
    // yerine ölçüleri sözlükten gelen çip kartları var, bu yüzden sürücü `selectOption`
    // değil çipe tıklıyor. Sorduğu şey aynı: değer oluşturmada, düzenlemede ve yenilemeden
    // sonra korunuyor mu.
    const openChannelContextMenu = async (target: Page, channelName: string) => {
      await target.getByText(channelName, { exact: true }).click({ button: "right" });
      await expect(target.getByTestId("channel-context-edit")).toBeVisible();
    };
    const openCreateChannelWizard = async (target: Page, kind: "text" | "voice") => {
      await target.getByTestId("server-header-button").click();
      await target.getByTestId("server-menu-createChannel").click();
      await target.getByTestId(`channel-kind-${kind}`).click();
    };
    const pickChip = (form: Locator, group: string, label: string) =>
      form.getByTestId(group).getByRole("radio", { name: label, exact: true }).click();
    const expectChip = (form: Locator, group: string, label: string) =>
      expect(
        form.getByTestId(group).getByRole("radio", { name: label, exact: true }),
      ).toHaveAttribute("aria-checked", "true");

    try {
      await loginAs(page, "alice");
      await gotoAppRoute(page, `/channels/${serverId}/${textChannelId}`, {
        readyTestId: "channel-sidebar",
      });

      // S4: kenar cubugunun iki hizli olusturma dugmesi kalkti; kanal olusturma SPEC 2.2'nin
      // bes satirlik sunucu menusunden geciyor ve tur sihirbazin ilk adiminda seciliyor.
      await openCreateChannelWizard(page, "voice");
      const voiceForm = page.getByTestId("channel-form");
      await voiceForm.getByRole("textbox").first().fill(voiceName);
      await pickChip(voiceForm, "channel-bitrate", "96 kbps");
      await pickChip(voiceForm, "channel-user-limit", "3");
      await pickChip(voiceForm, "channel-video-quality", "Tam kalite");
      await page.getByTestId("channel-submit-button").click();
      await expect(page.getByText(voiceName, { exact: true })).toBeVisible();

      await openCreateChannelWizard(page, "text");
      const textForm = page.getByTestId("channel-form");
      await textForm.getByRole("textbox").first().fill(textName);
      await pickChip(textForm, "channel-slow-mode", "30 sn");
      await page.getByTestId("channel-submit-button").click();
      await expect(page.getByText(textName, { exact: true })).toBeVisible();

      await page.reload();
      await expect(page.getByTestId("channel-sidebar")).toBeVisible();
      // S4: satirdaki kalem/cop kaplamasi kalkti (referansta yok); duzenleme sag tik menusunde.
      await openChannelContextMenu(page, voiceName);
      await page.getByTestId("channel-context-edit").click();

      const editForm = page.getByTestId("channel-form");
      await expectChip(editForm, "channel-bitrate", "96 kbps");
      await expectChip(editForm, "channel-user-limit", "3");
      await expectChip(editForm, "channel-rtc-region", "Otomatik");
      await expectChip(editForm, "channel-video-quality", "Tam kalite");

      await pickChip(editForm, "channel-bitrate", "128 kbps");
      await pickChip(editForm, "channel-user-limit", "5");
      await pickChip(editForm, "channel-video-quality", "Otomatik — önerilen");
      await page.getByTestId("channel-submit-button").click();
      await expect(editForm).toBeHidden();

      await page.reload();
      await expect(page.getByTestId("channel-sidebar")).toBeVisible();
      // S4: satirdaki kalem/cop kaplamasi kalkti (referansta yok); duzenleme sag tik menusunde.
      await openChannelContextMenu(page, voiceName);
      await page.getByTestId("channel-context-edit").click();
      const refreshedForm = page.getByTestId("channel-form");
      await expectChip(refreshedForm, "channel-bitrate", "128 kbps");
      await expectChip(refreshedForm, "channel-user-limit", "5");
      await expectChip(refreshedForm, "channel-video-quality", "Otomatik — önerilen");
    } finally {
      await deleteIsolatedE2EServer(serverId);
    }
  });
});
