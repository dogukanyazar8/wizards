import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const BUILD_ID = "0.9.0-2026-09-16T08-28-35-557Z";

test("settings build ID stays compact and copies the complete identity with honest feedback", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    stdin: {
      resolveDir: root,
      loader: "tsx",
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { LocaleProvider } from "@/components/providers/locale-provider";
        import { APP_LOCALE_STORAGE_KEY, getMessagesForLocale } from "@/lib/locale";
        import { VersionGridBlock } from "@/components/settings/blocks/version-grid-block";
        import { DesktopSettingsContext, UNKNOWN_DESKTOP_SETTINGS } from "@/components/settings/sections/desktop/desktop-settings-context";
        const root = createRoot(document.getElementById("root"));
        window.mount = (buildId, locale = "tr") => {
          localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
          root.render(
          <LocaleProvider key={locale} initialLocale={locale} initialMessages={getMessagesForLocale(locale)}>
            <DesktopSettingsContext.Provider value={{...UNKNOWN_DESKTOP_SETTINGS,
              buildInfo:buildId === null ? null : {buildId,version:"0.9.0",releaseChannel:"beta"}}}>
              <VersionGridBlock row={{key:"o2",type:"custom",block:"version"}} data={{}} />
            </DesktopSettingsContext.Provider>
          </LocaleProvider>);
        };
      `,
    },
  });
  const cssPath = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
  const css = await postcss([tailwind()]).process(await readFile(cssPath, "utf8"), {
    from: cssPath,
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://settings.invalid/", (route) =>
      route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
    );
    await page.goto("https://settings.invalid/");
    await page.addStyleTag({ content: css.css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate((id) => window.mount(id), BUILD_ID);
    const row = page.locator('[data-version-row="buildId"]');
    const copy = row.getByRole("button", { name: `Build ID’yi kopyala: ${BUILD_ID}`, exact: true });
    await expect(copy).toBeVisible();
    await expect(copy).toHaveAttribute("title", BUILD_ID);
    const label = copy.locator("span").first();
    assert.equal(await label.textContent(), BUILD_ID);
    assert.equal(await label.evaluate((el) => el.scrollWidth > el.clientWidth), true);

    // Exercise the actual browser clipboard, including keyboard activation.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await copy.focus();
    await page.keyboard.press("Enter");
    await expect(row.getByRole("status")).toHaveText("Build ID kopyalandı.");
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), BUILD_ID);

    // Reset success state for a new identity, and report denial instead of success.
    await page.evaluate(() => {
      window.mount("12345678-abcdef12");
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new DOMException("Denied", "NotAllowedError");
          },
        },
      });
    });
    await expect(row.getByRole("status")).toHaveCount(0);
    await row.getByRole("button").click();
    await expect(row.getByRole("alert")).toContainText(
      "Kopyalanamadı. Tam kimliği seçip kopyalayabilirsin.",
    );
    await expect(row.getByRole("alert")).toContainText("12345678-abcdef12");

    await page.evaluate(() => {
      window.mount("a".repeat(160), "en");
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    });
    await row.getByRole("button").click();
    await expect(row.getByRole("alert")).toContainText(
      "Could not copy. Select and copy the full ID.",
    );
    await expect(row.getByRole("alert")).toContainText("a".repeat(160));
    await page.setViewportSize({ width: 360, height: 480 });
    assert.equal(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);

    await page.evaluate(() => window.mount(null));
    await expect(row.getByRole("button")).toHaveCount(0);
    await expect(row).toContainText("—");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
