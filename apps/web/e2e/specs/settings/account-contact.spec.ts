import { test, expect } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { gotoAppRoute } from "../../helpers/navigation";
import { withE2EDatabase } from "../../helpers/db";
import { e2eUsers } from "../../helpers/test-data";

test("uygulama içi ayarlarda iletişim ve parola alanları açılır, kullanılabilir ve kapanır", async ({
  page,
}) => {
  await loginAs(page, "alice");
  await gotoAppRoute(page, "/home", { readyTestId: "home-command-center" });
  await page.getByTestId("user-settings-button").filter({ visible: true }).click();
  await page.getByTestId("user-appearance-settings-button").filter({ visible: true }).click();
  const settings = page.getByTestId("settings-window");
  await expect(settings).toHaveAttribute("data-mode", "modal");
  await page.locator("#settings-tab-account").click();

  for (const [row, value] of [
    ["ae", "new@example.test"],
    ["ap", "+90 532 123 45 67"],
  ] as const) {
    const trigger = page.getByTestId(`setting-actions-${row}-0`);
    await expect(trigger).toBeEnabled();
    await trigger.click();
    const field = page.getByTestId("settings-contact-value");
    await expect(
      page.locator(`[data-setting-row="${row}"]`).getByTestId("settings-contact-value"),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await field.click({ trial: true });
    await field.fill(value);
    await expect(field).toHaveValue(value);
    await page.keyboard.press("Escape");
    await expect(field).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect(trigger).toBeFocused();
  }

  const password = page.getByTestId("setting-risky-apw");
  for (const close of ["cancel", "escape", "trigger"] as const) {
    await password.click();
    await expect(password).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("settings-password-current")).toBeFocused();
    await expect(page.getByTestId("settings-password-current")).toBeInViewport();
    for (const name of ["current", "next", "confirm"]) {
      await page.getByTestId(`settings-password-${name}`).fill("Example-password-123");
    }
    if (close === "cancel") await page.getByTestId("settings-password-cancel").click();
    else if (close === "escape") await page.keyboard.press("Escape");
    else await password.click();
    await expect(page.getByTestId("settings-password-current")).toHaveCount(0);
    await expect(password).toHaveAttribute("aria-expanded", "false");
    await expect(settings).toBeVisible();
  }
});

test("hesap iletişim seçenekleri, doğrulama ve bağlı hesapların Yakında durumu", async ({
  page,
}) => {
  await loginAs(page, "alice");
  await gotoAppRoute(page, "/settings/account/account", { readyTestId: "settings-window" });
  await expect(page.getByTestId("setting-actions-ae-0")).toBeEnabled();
  await expect(page.locator('[data-setting-row="ae2"]')).toHaveCount(0);
  await expect(page.getByText("Bağlı hesaplar profilinde görünür.")).toHaveCount(0);
  await expect(page.getByTestId("setting-actions-ap-0")).toBeEnabled();
  await expect(page.getByTestId("setting-actions-ap-1")).toBeDisabled();
  await expect(page.getByTestId("setting-actions-ap-1")).toContainText("Yakında");
  for (const service of ["github", "spotify", "steam", "xbox"]) {
    const action = page.getByTestId(`settings-connection-${service}-action`);
    await expect(action).toBeDisabled();
    await expect(action).toHaveText("Yakında");
  }
  await page.getByTestId("setting-actions-ae-0").click();
  await expect(page.getByTestId("settings-contact-value")).toHaveAttribute("type", "email");
  await expect(page.getByTestId("settings-contact-submit")).toBeDisabled();
  await page.getByTestId("settings-contact-value").fill("email-change@example.test");
  await page.getByTestId("settings-contact-password").fill("deliberately-wrong-password");
  await page.getByTestId("settings-contact-submit").click();
  await expect(page.getByRole("alert")).toContainText("Mevcut parola yanlış.");
  await expect(page.getByTestId("settings-contact-code")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings-contact-value")).toHaveCount(0);
});

test("telefon ekleme yeniden yükleme sonrası kalıcı; doğrulama false", async ({ page }) => {
  const original = await withE2EDatabase((db) =>
    db.user.findUniqueOrThrow({
      where: { email: e2eUsers.alice.email },
      select: { id: true, phoneNumber: true, phoneVerified: true },
    }),
  );
  try {
    await loginAs(page, "alice");
    await gotoAppRoute(page, "/settings/account/account", { readyTestId: "settings-window" });
    await page.getByTestId("setting-actions-ap-0").click();
    await page.getByTestId("settings-contact-value").fill("0532invalid");
    await page.getByTestId("settings-contact-submit").click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByTestId("settings-contact-value").fill("+90 532 123 42 18");
    await page.getByTestId("settings-contact-submit").click();
    await expect(page.getByTestId("settings-contact-value")).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-setting-row="ap"]')).toContainText("+905•••••4218");
    const stored = await withE2EDatabase((db) =>
      db.user.findUniqueOrThrow({ where: { id: original.id } }),
    );
    expect(stored.phoneNumber).toBe("+905321234218");
    expect(stored.phoneVerified).toBe(false);
  } finally {
    await withE2EDatabase((db) =>
      db.user.update({
        where: { id: original.id },
        data: {
          phoneNumber: original.phoneNumber,
          phoneVerified: original.phoneVerified,
        },
      }),
    );
  }
});
