import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

test("desktop login and register share compact verification without hiding required challenges", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"development"',
      "process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY": '"fixture-site-key"',
      "process.env": "{}",
    },
    stdin: {
      resolveDir: root,
      loader: "tsx",
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { LoginClient } from "@/app/(auth)/login/login-client";
        import { RegisterClient } from "@/app/(auth)/register/register-client";
        import { LocaleProvider } from "@/components/providers/locale-provider";
        import { AuthSurfaceProvider } from "@/components/auth/auth-surface";
        import { getMessagesForLocale } from "@/lib/locale";
        window.__WHISPR_DESKTOP__ = {shell:"desktop"};
        createRoot(document.getElementById("root")).render(
          <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
            <AuthSurfaceProvider surface="desktop">{location.pathname === "/register" ? <RegisterClient callbackUrl="/channels" /> : <LoginClient callbackUrl="/channels" />}</AuthSurfaceProvider>
          </LocaleProvider>
        );
      `,
    },
    plugins: [
      {
        name: "login-fixture-boundaries",
        setup(builder) {
          const modules = {
            "@/lib/auth/actions":
              "export const loginAction = async () => { throw new Error('Unexpected credential submission'); }; export const registerAction = async (data) => { window.submittedToken = data.get('turnstileToken'); return {success:true}; };",
            "next-auth/react": "export const signIn = async () => {};",
            "next/navigation":
              "const router = {replace(path){window.redirectPath=path},push(){}}; export const useRouter = () => router;",
          };
          builder.onResolve(
            { filter: /^(?:@\/lib\/auth\/actions|next-auth\/react|next\/navigation)$/ },
            ({ path }) => ({ path, namespace: "login-fixture" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "login-fixture" }, ({ path }) => ({
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
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.includes("username-availability")) {
        return route.fulfill({ json: { available: true, suggestions: [] } });
      }
      if (url.startsWith("https://challenges.cloudflare.com/turnstile/v0/api.js")) {
        return route.fulfill({
          contentType: "application/javascript",
          body: `
          window.turnstile = {
            render(container, options) {
              window.challengeOptions = options;
              const button = document.createElement("button");
              button.type = "button";
              button.textContent = "Complete security challenge";
              button.onclick = () => options.callback("fixture-token");
              container.appendChild(button);
              return "fixture-widget";
            },
            remove() { document.querySelector(".auth-reference-turnstile-mount")?.replaceChildren(); }
          };
        `,
        });
      }
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    for (const screen of ["login", "register"]) {
      await page.goto(`https://login.invalid/${screen}`);
      await page.addStyleTag({ content: css.css });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const submit = page.locator('form button[type="submit"]');
      await page.locator('input[type="email"]').fill("fixture@example.test");
      await page.locator('input[type="password"]').fill("Fixture-only-password1!");
      if (screen === "register") {
        await page.locator('input[name="displayName"]').fill("Fixture User");
        await page.locator('input[name="username"]').fill("fixture_user");
        await page.getByRole("checkbox").focus();
        await page.keyboard.press("Space");
        await expect(page.getByRole("checkbox")).toBeChecked();
      } else {
        for (const provider of ["Microsoft", "Apple"]) {
          const button = page.getByRole("button", { name: new RegExp(provider) });
          await expect(button).toBeDisabled();
          await expect(button).toHaveCSS("cursor", "default");
        }
      }
      await expect(submit).toBeDisabled();
      await expect(page.locator('.auth-turnstile-tile[data-state="pending"]')).toBeVisible();
      const challenge = page.getByRole("button", { name: "Complete security challenge" });
      await expect(challenge).toBeInViewport();
      assert.equal(
        await page.evaluate(() => window.challengeOptions.appearance),
        "interaction-only",
      );
      await challenge.click();
      await expect(submit).toBeEnabled();
      await expect(page.locator('.auth-turnstile-tile[data-state="verified"]')).toBeVisible();
      await page.evaluate(() => window.challengeOptions["expired-callback"]());
      await expect(submit).toBeDisabled();
      await expect(page.locator('.auth-turnstile-tile[data-state="pending"]')).toBeVisible();
      for (const callback of ["error-callback", "timeout-callback", "unsupported-callback"]) {
        await page.evaluate((name) => window.challengeOptions[name](), callback);
        await expect(submit).toBeDisabled();
        await expect(page.getByRole("alert")).toContainText(
          "Güvenlik doğrulaması şu anda kullanılamıyor",
        );
        await challenge.click();
        await expect(submit).toBeEnabled();
        await expect(page.getByRole("alert")).toHaveCount(0);
      }
      if (screen === "register") {
        await submit.click();
        await expect.poll(() => page.evaluate(() => window.submittedToken)).toBe("fixture-token");
        await expect
          .poll(() => page.evaluate(() => window.redirectPath))
          .toBe("/verify-email?next=%2Fchannels");
      } else {
        await page.evaluate(() => {
          window.oauthWindows = [];
          window.open = (...args) => {
            window.oauthWindows.push(args);
            return null;
          };
        });
        const google = page.getByRole("button", { name: /Google/ });
        await google.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        for (const theme of ["light", "dark"]) {
          await page.evaluate(
            (value) => document.documentElement.setAttribute("data-auth-theme", value),
            theme,
          );
          for (const width of [1280, 540, 390]) {
            await page.setViewportSize({ width, height: 800 });
            // Wait for the shared button's theme transition before comparing colors.
            await expect
              .poll(() =>
                dialog.evaluate(
                  (element) =>
                    getComputedStyle(element.querySelector(".auth-block-icon")).color ===
                    getComputedStyle(element.querySelector(".auth-btn-primary")).backgroundColor,
                ),
              )
              .toBe(true);
            const geometry = await dialog.evaluate((element) => {
              const button = element.querySelector(".auth-btn-primary");
              const icon = button.querySelector("svg").getBoundingClientRect();
              const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
              let text;
              while (walker.nextNode()) {
                if (walker.currentNode.textContent.trim()) {
                  text = walker.currentNode;
                  break;
                }
              }
              const range = document.createRange();
              range.selectNodeContents(text);
              const label = range.getBoundingClientRect();
              const card = element.querySelector("section").getBoundingClientRect();
              return {
                iconY: icon.y + icon.height / 2,
                labelY: label.y + label.height / 2,
                iconRight: icon.right,
                labelLeft: label.left,
                spinnerColor: getComputedStyle(element.querySelector(".auth-block-icon")).color,
                primaryColor: getComputedStyle(button).backgroundColor,
                cardLeft: card.left,
                cardRight: card.right,
                viewport: innerWidth,
              };
            });
            assert.ok(
              Math.abs(geometry.iconY - geometry.labelY) < 3,
              "retry icon and label must share a row",
            );
            assert.ok(geometry.iconRight < geometry.labelLeft, "retry icon must precede its label");
            assert.equal(
              geometry.spinnerColor,
              geometry.primaryColor,
              "pending must use the primary color",
            );
            assert.ok(geometry.cardLeft >= 0 && geometry.cardRight <= geometry.viewport);
            if (process.env.AUTH_PENDING_SCREENSHOT_DIR) {
              await mkdir(process.env.AUTH_PENDING_SCREENSHOT_DIR, { recursive: true });
              await dialog.locator("section").screenshot({
                path: join(
                  process.env.AUTH_PENDING_SCREENSHOT_DIR,
                  `pending-${width}-${theme}.png`,
                ),
              });
            }
          }
        }
        await dialog.locator(".auth-btn-primary").click();
        const windows = await page.evaluate(() => window.oauthWindows);
        assert.equal(windows.length, 2);
        assert.deepEqual(windows[0], windows[1]);
        assert.equal(windows[0][1], "_blank");
        assert.equal(windows[0][2], "noopener,noreferrer");
        const start = new URL(windows[0][0]);
        assert.equal(start.pathname, "/desktop/oauth/start");
        assert.equal(start.searchParams.get("callbackUrl"), "/channels");
        await dialog.getByRole("button", { name: "İptal et", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(google).toBeEnabled();
        await google.click();
        await dialog.getByRole("button", { name: "Kapat", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await page.setViewportSize({ width: 1280, height: 1000 });
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
