import { expect, test as base } from "@playwright/test";
import { attachE2EPageDiagnostics } from "../helpers/diagnostics";

/**
 * `08-faz7` §1 — ekranların metni artık sözlükten geliyor ve `LocaleProvider` yerelini
 * tarayıcıdan seçiyor. Playwright'ın tarayıcısı `en-US` konuşuyor; tasarım ve parity spec'leri
 * ise **Türkçe** metni doğruluyor (SPEC metni Türkçe verildi). Yerel bu yüzden burada, tek
 * yerde sabitleniyor: her spec'in kendi başına `wizards.locale` yazması üç kopya olurdu.
 */
async function pinTurkishLocale(page: Parameters<typeof attachE2EPageDiagnostics>[0]) {
  await page.addInitScript(() => {
    window.localStorage.setItem("wizards.locale", "tr");
    document.cookie = "wizards.locale=tr; path=/; max-age=31536000; samesite=lax";
  });
}

export const test = base.extend({
  page: async ({ page }, runPage, testInfo) => {
    const diagnostics = attachE2EPageDiagnostics(page, testInfo, "browser");

    await pinTurkishLocale(page);

    try {
      await runPage(page);
    } finally {
      await diagnostics.attachIfFailed();
      diagnostics.dispose();
    }
  },
});
export { expect };
