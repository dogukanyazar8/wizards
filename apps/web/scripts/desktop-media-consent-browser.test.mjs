import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { chromium, expect } from "@playwright/test";

test("native media consent shows only the card and preserves explicit permission decisions", async () => {
  const assetRoot = new URL("../../desktop/src-tauri/assets/desktop-control/", import.meta.url);
  const [html, css, js, font, native] = await Promise.all([
    readFile(new URL("index.html", assetRoot), "utf8"),
    readFile(new URL("app.css", assetRoot), "utf8"),
    readFile(new URL("app.js", assetRoot), "utf8"),
    readFile(new URL("../src/app/fonts/outfit-latin.woff2", import.meta.url)),
    readFile(new URL("../../desktop/src-tauri/src/lib.rs", import.meta.url), "utf8"),
  ]);
  const width = Number(native.match(/const DESKTOP_CONTROL_WIDTH: f64 = ([\d.]+);/)[1]);
  const height = Number(native.match(/const DESKTOP_CONTROL_HEIGHT: f64 = ([\d.]+);/)[1]);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const path = new URL(route.request().url()).pathname;
      const assets = {
        "/index.html": ["text/html", html],
        "/app.css": ["text/css", css],
        "/app.js": ["application/javascript", js],
        "/font.woff2": ["font/woff2", font],
      };
      const asset = assets[path];
      assert.ok(asset, `unexpected network request: ${path}`);
      return route.fulfill({ contentType: asset[0], body: asset[1] });
    });
    await page.addInitScript(() => {
      window.decisions = [];
      window.__TAURI_INTERNALS__ = {
        invoke: async (command, args) => {
          if (command === "get_desktop_control_state") {
            if (location.search.includes("unavailable")) throw new Error("fixture state failure");
            return {
              mediaPermissionPrompt: {
                kind: location.hash.slice(1),
                requestId: "media-permission-1",
              },
            };
          }
          if (command === "resolve_desktop_media_permission") {
            window.decisions.push(args);
            if (window.failResolution) throw new Error("private native failure");
            return;
          }
          throw new Error(`Unexpected command: ${command}`);
        },
      };
    });
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      for (const kind of ["microphone", "camera"]) {
        await page.goto(`https://consent.invalid/index.html?case=${colorScheme}-${kind}#${kind}`);
        await page.evaluate(() => document.fonts.ready);
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(page.locator("main")).toBeHidden();
        await expect(page.getByRole("button", { name: "Şimdi değil" })).toBeFocused();
        const canvas = await page.evaluate(() => {
          const dialog = document.querySelector("dialog");
          return {
            root: getComputedStyle(document.documentElement).backgroundColor,
            body: getComputedStyle(document.body).backgroundColor,
            backdrop: getComputedStyle(dialog, "::backdrop").backgroundColor,
            blur: getComputedStyle(dialog, "::backdrop").backdropFilter,
          };
        });
        assert.deepEqual(canvas, {
          root: "rgba(0, 0, 0, 0)",
          body: "rgba(0, 0, 0, 0)",
          backdrop: "rgba(0, 0, 0, 0)",
          blur: "none",
        });
        assert.deepEqual(await page.evaluate(() => window.decisions), []);
        await expect(page.getByRole("button", { name: "İzin ver" })).toBeInViewport();
        if (process.env.DESKTOP_CONSENT_SCREENSHOT_DIR) {
          await mkdir(process.env.DESKTOP_CONSENT_SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({
            path: join(process.env.DESKTOP_CONSENT_SCREENSHOT_DIR, `${kind}-${colorScheme}.png`),
            omitBackground: true,
          });
        }
        if (kind === "camera") {
          await page.keyboard.press("Escape");
        } else {
          await page.getByRole("button", { name: "İzin ver" }).click();
        }
        await expect(dialog).not.toBeVisible();
        assert.deepEqual(await page.evaluate(() => window.decisions), [
          { allowed: kind !== "camera", requestId: "media-permission-1" },
        ]);
      }
    }
    // Smaller work areas and native failures must leave the denial button reachable.
    await page.setViewportSize({ width: 360, height: 420 });
    await page.goto("https://consent.invalid/index.html?case=small#microphone");
    await page.evaluate(() => {
      window.failResolution = true;
    });
    await page.getByRole("button", { name: "İzin ver" }).click();
    await expect(page.locator("#media-permission-result")).toContainText("Tercih uygulanamadı");
    await expect(page.getByRole("dialog")).not.toContainText("private native failure");
    await page.getByRole("button", { name: "Şimdi değil" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Şimdi değil" })).toBeInViewport();
    await page.evaluate(() => {
      window.failResolution = false;
    });
    await page.getByRole("button", { name: "Şimdi değil" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.goto("https://consent.invalid/index.html?unavailable#microphone");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("button", { name: "Yeniden dene" })).toBeVisible();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
