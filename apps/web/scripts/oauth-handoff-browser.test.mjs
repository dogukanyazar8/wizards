import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

test("Google handoff screens preserve retries, return paths, themes and responsive layout", async () => {
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
        import { DesktopOAuthStartClient } from "@/app/desktop/oauth/start/desktop-oauth-start-client";
        import { DesktopOAuthCompleteClient } from "@/app/desktop/oauth/complete/desktop-oauth-complete-client";
        import { DesktopOAuthClaimClient } from "@/app/desktop/oauth/claim/[token]/desktop-oauth-claim-client";
        import { MobileOAuthStartClient } from "@/app/mobile/oauth/start/mobile-oauth-start-client";
        import { MobileOAuthCompleteClient } from "@/app/mobile/oauth/complete/mobile-oauth-complete-client";
        import { LocaleProvider } from "@/components/providers/locale-provider";
        import { getMessagesForLocale } from "@/lib/locale";
        const query = new URLSearchParams(location.search);
        if (query.has("native")) window.__WHISPR_DESKTOP__ = { shell: "desktop" };
        const screens = {
          "/desktop/start": <DesktopOAuthStartClient callbackUrl="/channels/@me" />,
          "/desktop/complete": <DesktopOAuthCompleteClient callbackUrl="/channels/@me" desktopHandoffUrl="#handoff-fixture" />,
          "/desktop/claim": <DesktopOAuthClaimClient callbackUrl="/channels/@me" token="fixture-only" />,
          "/mobile/start": <MobileOAuthStartClient callbackUrl="/channels/@me" provider="google" state={"a".repeat(64)} />,
          "/mobile/complete": <MobileOAuthCompleteClient appHandoffUrl="#handoff-fixture" />,
        };
        createRoot(document.getElementById("root")).render(
          <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
            {screens[location.pathname]}
          </LocaleProvider>
        );
      `,
    },
    plugins: [
      {
        name: "oauth-fixture-boundaries",
        setup(builder) {
          const modules = {
            "next-auth/react": `
            export const signOut = async (options) => { (window.calls ??= []).push(["signOut", options]); };
            export const signIn = async (...args) => {
              window.calls.push(["signIn", ...args]);
              if (!window.allowSignIn) throw new Error("Fixture provider failure");
            };
          `,
            "next/navigation":
              "const router = {replace(path){window.redirectPath=path}}; export const useRouter = () => router;",
            "./actions": `export const claimDesktopOAuthHandoffAction = async (...args) => {
            window.claimArgs = args;
            return {success:false, error:"auth.desktopOAuth.invalid"};
          };`,
          };
          builder.onResolve(
            { filter: /^(next-auth\/react|next\/navigation|\.\/actions)$/ },
            ({ path, importer }) => {
              if (path === "./actions" && !importer.endsWith("desktop-oauth-claim-client.tsx"))
                return;
              return { path, namespace: "oauth-fixture" };
            },
          );
          builder.onLoad({ filter: /.*/, namespace: "oauth-fixture" }, ({ path }) => ({
            contents: modules[path],
          }));
        },
      },
    ],
  });
  const cssPath = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
  const css = await postcss([tailwind()]).process(await readFile(cssPath, "utf8"), {
    from: cssPath,
  });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) =>
      route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
    );
    await page.addInitScript(() => {
      window.close = () => {
        window.closeAttempts = (window.closeAttempts ?? 0) + 1;
      };
      window.open = () => null;
      localStorage.clear();
    });
    async function open(path) {
      await page.goto(`https://oauth.invalid${path}`);
      await page.addStyleTag({ content: css.css });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
    }
    for (const platform of ["desktop", "mobile"]) {
      await open(`/${platform}/start`);
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.locator(".auth-btn-primary")).toBeEnabled();
      const calls = await page.evaluate(() => window.calls);
      assert.deepEqual(
        calls.map((call) => call[0]),
        ["signOut", "signIn"],
      );
      assert.deepEqual(calls[0][1], { redirect: false });
      assert.equal(calls[1][1], "google");
      const callback = new URL(calls[1][2].callbackUrl, "https://oauth.invalid");
      assert.equal(callback.pathname, `/${platform}/oauth/complete`);
      assert.equal(callback.searchParams.get("callbackUrl"), "/channels/@me");
      if (platform === "mobile") assert.equal(callback.searchParams.get("state"), "a".repeat(64));
      assert.equal(calls[1][3].prompt, "select_account");
      await page.evaluate(() => {
        window.allowSignIn = true;
      });
      await page.locator(".auth-btn-primary").click();
      await expect(page.locator(".auth-btn-primary")).toBeDisabled();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => window.calls.length)).toBe(4);
      // Changing display preferences must not restart OAuth or discard callback/state.
      await page.getByRole("button", { name: "Dil seçici" }).click();
      await page.getByRole("menuitemradio", { name: "EN", exact: true }).click();
      await expect(page.locator("h1")).toHaveText("Secure Google sign-in");
      assert.equal(await page.evaluate(() => window.calls.length), 4);

      await open(`/${platform}/complete`);
      await expect(page.locator(".auth-btn-primary")).toHaveAttribute("href", "#handoff-fixture");
      await expect.poll(() => page.evaluate(() => location.hash)).toBe("#handoff-fixture");
      await expect.poll(() => page.evaluate(() => window.closeAttempts)).toBe(1);
      await expect(
        page.locator(".auth-btn-secondary, .auth-banner, .auth-hint, .auth-brand, .auth-footer"),
      ).toHaveCount(0);
      await expect(page.locator("main .auth-btn-primary")).toHaveCount(1);
      await page.locator(".auth-btn-primary").click();
      await expect.poll(() => page.evaluate(() => window.closeAttempts)).toBe(2);
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ["Açık", "Koyu"]) {
          await page.getByRole("radio", { name: theme, exact: true }).click();
          await expect(page.getByRole("radio", { name: theme, exact: true })).toBeChecked();
          await expect(page.locator("h1")).toBeVisible();
          await expect(page.locator(".auth-btn-primary")).toBeInViewport();
          const layout = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            viewport: innerWidth,
            font: getComputedStyle(document.querySelector("h1")).fontFamily,
            shellFont: getComputedStyle(document.querySelector(".auth-status-card")).fontFamily,
            titleColor: getComputedStyle(document.querySelector("h1")).color,
            logoColor: getComputedStyle(document.querySelector(".whispr-logo-wordmark")).color,
            cardColor: getComputedStyle(document.querySelector(".auth-status-card")).color,
            controlsBottom: document.querySelector(".auth-controls").getBoundingClientRect().bottom,
            logoTop: document.querySelector(".whispr-brand-logo").getBoundingClientRect().top,
          }));
          assert.ok(
            layout.width <= layout.viewport,
            `${platform}/${theme}/${width}: horizontal overflow`,
          );
          assert.equal(layout.font, layout.shellFont);
          assert.equal(layout.titleColor, layout.cardColor);
          assert.equal(layout.logoColor, layout.cardColor);
          assert.ok(layout.controlsBottom <= layout.logoTop, "controls must not overlap the logo");
          if (process.env.OAUTH_HANDOFF_SCREENSHOT_DIR) {
            await mkdir(process.env.OAUTH_HANDOFF_SCREENSHOT_DIR, { recursive: true });
            await page.screenshot({
              path: join(
                process.env.OAUTH_HANDOFF_SCREENSHOT_DIR,
                `${platform}-${width}-${theme}.png`,
              ),
              fullPage: true,
            });
          }
        }
      }
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    await open("/desktop/claim");
    await expect(page.locator("h1")).toContainText("Whispr Desktop");
    assert.equal(await page.evaluate(() => window.claimArgs), undefined);
    await open("/desktop/complete?native=1");
    await expect.poll(() => page.evaluate(() => window.redirectPath)).toBe("/channels/@me");
    assert.equal(await page.evaluate(() => window.closeAttempts), undefined);
    await open("/desktop/claim?native=1");
    await expect(page.getByRole("alert")).toContainText("geçersiz veya süresi dolmuş");
    assert.deepEqual(await page.evaluate(() => window.claimArgs), [
      "fixture-only",
      "/channels/@me",
    ]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
